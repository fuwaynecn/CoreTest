import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerForm } from "@/components/answer-form";
import { QuestionCard } from "@/components/question-card";
import { SessionProgress } from "@/components/session-progress";
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

export default async function ChildSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const child = await requireRole("child");
  const { id } = await params;
  const session = getOrCreateDailySession(getDatabase(), child.id, shanghaiDate());

  if (session.id !== id) notFound();

  const question = session.questions.find((item) => !item.answered);

  if (!question) {
    return (
      <main className="trainingPage completionCard">
        <p className="eyebrow">今天的训练完成</p>
        <h1>你认真完成了今天的题目</h1>
        <p>记得把每一道题的审题过程也记在心里。</p>
        <Link className="primaryButton" href="/child">回到今天的训练</Link>
      </main>
    );
  }

  return (
    <main className="trainingPage">
      <SessionProgress current={question.position + 1} />
      <QuestionCard stem={question.stem} />
      <AnswerForm sessionItemId={question.id} nextHref={`/child/session/${session.id}`} />
    </main>
  );
}
