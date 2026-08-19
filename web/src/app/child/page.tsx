import Link from "next/link";
import { getDatabase } from "@/db/client";
import { requireRole } from "@/lib/auth/current-user";
import { getOrCreateDailySession } from "@/services/training/create-daily-session";

function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default async function ChildHomePage() {
  const child = await requireRole("child");
  const session = getOrCreateDailySession(getDatabase(), child.id, shanghaiDate());
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
