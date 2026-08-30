import Link from "next/link";
import { getDatabase } from "@/db/client";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import { getDiagnosisLearningGate, getOrCreateDiagnosis } from "@/services/diagnosis/diagnosis-service";
import { getOrCreateDailySession } from "@/services/training/create-daily-session";

export default async function ChildHomePage() {
  const child = await requireRole("child");
  const db = getDatabase();
  const gate = getDiagnosisLearningGate(db, child.id);
  if (!gate.formalDailyUnlocked) {
    const diagnosis = gate.activeDiagnosis ?? getOrCreateDiagnosis(db, child.id);
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
  const session = getOrCreateDailySession(db, child.id, shanghaiDateKey());
  if (session.status === "completed") {
    return <main className="trainingPage completionCard"><p className="eyebrow">今天的训练完成</p><h1>今天的训练已经完成</h1><p>明天再来继续新的练习。</p></main>;
  }
  if (session.status === "completed_early") {
    return <main className="trainingPage completionCard"><p className="eyebrow">今天先到这里</p><h1>已经保存好今天完成的部分</h1><p>下次训练会从适合你的内容继续开始。</p></main>;
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
      {gate.activeDiagnosis && (
        <aside className="activeRetest">
          <p>第 {gate.activeDiagnosis.version} 版诊断已开始，日常训练仍可照常完成。</p>
          <Link href={`/child/diagnosis/${gate.activeDiagnosis.runId}`}>继续第 {gate.activeDiagnosis.version} 版诊断</Link>
        </aside>
      )}
    </main>
  );
}
