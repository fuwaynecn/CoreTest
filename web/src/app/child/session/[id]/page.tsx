import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerForm } from "@/components/answer-form";
import { QuestionCard } from "@/components/question-card";
import { SessionProgress } from "@/components/session-progress";
import { getDatabase } from "@/db/client";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import { getOrCreateDailySession } from "@/services/training/create-daily-session";

export default async function ChildSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const child = await requireRole("child");
  const { id } = await params;
  const session = getOrCreateDailySession(getDatabase(), child.id, shanghaiDateKey());

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
