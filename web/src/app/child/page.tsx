import Link from "next/link";
import { getDatabase } from "@/db/client";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import { getOrCreateDiagnosis } from "@/services/diagnosis/diagnosis-service";
import { DailyTrainingLockedError, getOrCreateDailySession } from "@/services/training/create-daily-session";

export default async function ChildHomePage() {
  const child = await requireRole("child");
  const db = getDatabase();
  let session;
  try {
    session = getOrCreateDailySession(db, child.id, shanghaiDateKey());
  } catch (error) {
    if (!(error instanceof DailyTrainingLockedError)) throw error;
    const diagnosis = getOrCreateDiagnosis(db, child.id);
    return (
      <main className="trainingPage diagnosisHome">
        <p className="eyebrow">你好，{child.displayName}</p>
        <h1>先完成三部分数学体检</h1>
        <p>一共 45 题，可以分几次完成。这里不计时，也没有排名。</p>
        <p className="diagnosisHomeCount">已完成 {diagnosis.completedSlots} / {diagnosis.totalSlots} 题</p>
        <Link className="primaryButton trainingStart" href={`/child/diagnosis/${diagnosis.runId}`}>继续初始诊断</Link>
      </main>
    );
  }
  const label = session.questions.some((question) => question.answered)
    ? "继续今天的训练"
    : "开始今天的训练";

  return (
    <main className="trainingPage">
      <p className="eyebrow">你好，{child.displayName}</p>
      <h1>今天的数学训练</h1>
      <p>每次认真完成 3 道题。答错后可以订正，再继续下一题。</p>
      <Link className="primaryButton trainingStart" href={`/child/session/${session.id}`}>{label}</Link>
    </main>
  );
}
