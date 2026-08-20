import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  diagnosticRuns,
  questionTemplates,
  sessionItems,
  skills,
  trainingSessions,
} from "@/db/schema";
import type { SessionView } from "@/domain/training/types";

export class DailyTrainingLockedError extends Error {
  constructor() {
    super("Diagnosis must be completed before daily training");
    this.name = "DailyTrainingLockedError";
  }
}

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
      stem: sessionItems.stemSnapshot,
    }).from(sessionItems)
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
        eq(trainingSessions.kind, "daily"),
      ))
      .get();
    if (existing) return existing.id;

    const completedDiagnosis = tx.select({ id: diagnosticRuns.id }).from(diagnosticRuns)
      .where(and(
        eq(diagnosticRuns.childId, childId),
        eq(diagnosticRuns.status, "completed"),
      )).limit(1).get();
    if (!completedDiagnosis) throw new DailyTrainingLockedError();

    const id = randomUUID();
    const questions = tx.select({
      id: questionTemplates.id,
      stem: questionTemplates.stem,
      answerSpec: questionTemplates.answerSpec,
      explanation: questionTemplates.explanation,
      skillId: questionTemplates.skillId,
      skillName: skills.name,
    })
      .from(questionTemplates)
      .innerJoin(skills, eq(questionTemplates.skillId, skills.id))
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
        stemSnapshot: question.stem,
        answerSpecSnapshot: question.answerSpec,
        explanationSnapshot: question.explanation,
        skillIdSnapshot: question.skillId,
        skillNameSnapshot: question.skillName,
      }))).run();
    }

    return id;
  }, { behavior: "immediate" });

  return loadSessionView(db, sessionId);
}
