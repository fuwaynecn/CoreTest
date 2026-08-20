import Link from "next/link";
import { getDatabase } from "@/db/client";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import { getOrCreateDailySession } from "@/services/training/create-daily-session";

export default async function ChildHomePage() {
  const child = await requireRole("child");
  const session = getOrCreateDailySession(getDatabase(), child.id, shanghaiDateKey());
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
