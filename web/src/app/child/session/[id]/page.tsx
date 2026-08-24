import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerForm } from "@/components/answer-form";
import { QuestionCard } from "@/components/question-card";
import { Scratchpad } from "@/components/scratchpad";
import { StopSessionButton, TrainingSegments, type TrainingSegment } from "@/components/training-segments";
import { getDatabase } from "@/db/client";
import { sessionItems } from "@/db/schema";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import { getOrCreateDailySession } from "@/services/training/create-daily-session";
import { eq } from "drizzle-orm";

function categoryToSegment(category: unknown, selectionReason?: unknown): TrainingSegment {
  if (category === "review") return "warmup";
  if (category === "reading") return "reading";
  if ([category, selectionReason].some((value) => value === "correction" || value === "due-error" || value === "due_error")) return "correction";
  return "core";
}

function itemMetadata(raw: string) {
  try { return JSON.parse(raw) as { category?: unknown; selectionReason?: unknown; readingCard?: unknown }; } catch { return {}; }
}

export default async function ChildSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const child = await requireRole("child");
  const { id } = await params;
  const db = getDatabase();
  const session = getOrCreateDailySession(db, child.id, shanghaiDateKey());

  if (session.id !== id) notFound();

  const details = db.select({ id: sessionItems.id, metadata: sessionItems.selectionReasonSnapshot }).from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all();
  const metadataById = new Map(details.map((item) => [item.id, itemMetadata(item.metadata)]));
  const question = session.questions.find((item) => !item.answered);

  if (session.status === "completed_early") {
    return <main className="trainingPage completionCard"><p className="eyebrow">今天先到这里</p><h1>已经保存好今天完成的部分</h1><Link className="primaryButton" href="/child">回到今天的训练</Link></main>;
  }

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
      <TrainingSegments current={categoryToSegment(metadataById.get(question.id)?.category, metadataById.get(question.id)?.selectionReason)} composition={(["warmup", "core", "reading", "correction"] as TrainingSegment[]).reduce((counts, segment) => ({ ...counts, [segment]: session.questions.filter((item) => categoryToSegment(metadataById.get(item.id)?.category, metadataById.get(item.id)?.selectionReason) === segment).length }), { warmup: 0, core: 0, reading: 0, correction: 0 })} />
      <QuestionCard stem={question.stem} />
      <Scratchpad sessionItemId={question.id} />
      <AnswerForm sessionItemId={question.id} readingCard={metadataById.get(question.id)?.readingCard === true} nextHref={`/child/session/${session.id}`} />
      <StopSessionButton sessionId={session.id} sessionItemIds={session.questions.map((item) => item.id)} />
    </main>
  );
}
