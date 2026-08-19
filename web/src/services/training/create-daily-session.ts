import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  questionTemplates,
  sessionItems,
  trainingSessions,
} from "@/db/schema";
import type { SessionView } from "@/domain/training/types";

function loadSessionView(db: AppDatabase, sessionId: string): SessionView {
  return db.transaction((tx) => {
    const session = tx.select({
      id: trainingSessions.id,
      status: trainingSessions.status,
    }).from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();

    if (!session) throw new Error("Training session was not found");

    const items = tx.select({
      id: sessionItems.id,
      position: sessionItems.position,
      stem: questionTemplates.stem,
    }).from(sessionItems)
      .innerJoin(questionTemplates, eq(sessionItems.questionTemplateId, questionTemplates.id))
      .where(eq(sessionItems.sessionId, sessionId))
      .orderBy(asc(sessionItems.position))
      .all();

    const questions = items.map((item) => ({
      ...item,
      answered: tx.select({ id: attempts.id })
        .from(attempts)
        .where(and(eq(attempts.sessionItemId, item.id), eq(attempts.isCorrect, true)))
        .limit(1)
        .get() !== undefined,
    }));
    const firstUnanswered = questions.find((question) => !question.answered);

    return {
      id: session.id,
      status: session.status,
      currentPosition: firstUnanswered?.position ?? questions.length,
      questions,
    };
  });
}

export function getOrCreateDailySession(
  db: AppDatabase,
  childId: string,
  date: string,
): SessionView {
  const sessionId = db.transaction((tx) => {
    const existing = tx.select({ id: trainingSessions.id })
      .from(trainingSessions)
      .where(and(
        eq(trainingSessions.childId, childId),
        eq(trainingSessions.sessionDate, date),
      ))
      .get();
    if (existing) return existing.id;

    const id = randomUUID();
    const questions = tx.select({ id: questionTemplates.id })
      .from(questionTemplates)
      .where(eq(questionTemplates.active, true))
      .orderBy(asc(questionTemplates.difficulty), asc(questionTemplates.id))
      .limit(3)
      .all();

    tx.insert(trainingSessions).values({
      id,
      childId,
      sessionDate: date,
      status: "in_progress",
      startedAt: Date.now(),
    }).run();
    if (questions.length > 0) {
      tx.insert(sessionItems).values(questions.map((question, position) => ({
        id: randomUUID(),
        sessionId: id,
        questionTemplateId: question.id,
        position,
      }))).run();
    }

    return id;
  }, { behavior: "immediate" });

  return loadSessionView(db, sessionId);
}
