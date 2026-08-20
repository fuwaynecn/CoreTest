import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  masteryStates,
  sessionItems,
  trainingSessions,
} from "@/db/schema";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { scoreAnswer } from "@/domain/questions/score-answer";
import { nextMasteryEvidence } from "@/domain/training/mastery";

export type SubmitAttemptCommand = {
  childId: string;
  sessionItemId: string;
  clientSubmissionId: string;
  answerText: string;
};

export type AttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  sessionCompleted: boolean;
};

export class TrainingAccessError extends Error {
  constructor() {
    super("Training item is not available");
    this.name = "TrainingAccessError";
  }
}

export class InvalidAnswerError extends Error {
  constructor() {
    super("Answer must be at most 128 characters");
    this.name = "InvalidAnswerError";
  }
}

function parseAnswerSpec(raw: string) {
  return answerSpecSchema.parse(JSON.parse(raw));
}

export function submitAttempt(db: AppDatabase, command: SubmitAttemptCommand): AttemptResult {
  if (command.answerText.length > 128) throw new InvalidAnswerError();

  return db.transaction((tx) => {
    const existing = tx.select({
      childId: trainingSessions.childId,
      sessionKind: trainingSessions.kind,
      sessionItemId: attempts.sessionItemId,
      correct: attempts.isCorrect,
      normalizedAnswer: attempts.normalizedAnswer,
      explanation: attempts.explanation,
      sessionCompleted: attempts.sessionCompleted,
    }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(attempts.clientSubmissionId, command.clientSubmissionId))
      .get();

    if (existing) {
      if (
        existing.childId !== command.childId
        || existing.sessionItemId !== command.sessionItemId
        || existing.sessionKind === "diagnostic"
      ) {
        throw new TrainingAccessError();
      }
      return {
        correct: existing.correct,
        normalizedAnswer: existing.normalizedAnswer,
        explanation: existing.explanation,
        sessionCompleted: existing.sessionCompleted,
      };
    }

    const item = tx.select({
      sessionId: trainingSessions.id,
      sessionKind: trainingSessions.kind,
      skillId: sessionItems.skillIdSnapshot,
      answerSpec: sessionItems.answerSpecSnapshot,
      explanation: sessionItems.explanationSnapshot,
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(and(
        eq(sessionItems.id, command.sessionItemId),
        eq(trainingSessions.childId, command.childId),
        eq(trainingSessions.status, "in_progress"),
      ))
      .get();
    if (!item) throw new TrainingAccessError();
    if (item.sessionKind === "diagnostic") throw new TrainingAccessError();

    const score = scoreAnswer(command.answerText, parseAnswerSpec(item.answerSpec));
    const now = Date.now();
    const currentMastery = tx.select({
      evidenceCount: masteryStates.evidenceCount,
      correctCount: masteryStates.correctCount,
    }).from(masteryStates).where(and(
      eq(masteryStates.childId, command.childId),
      eq(masteryStates.skillId, item.skillId),
    )).get() ?? { evidenceCount: 0, correctCount: 0 };
    const nextMastery = nextMasteryEvidence(currentMastery, score.correct);

    tx.insert(masteryStates).values({
      childId: command.childId,
      skillId: item.skillId,
      ...nextMastery,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [masteryStates.childId, masteryStates.skillId],
      set: { ...nextMastery, updatedAt: now },
    }).run();

    const allItems = tx.select({ id: sessionItems.id })
      .from(sessionItems)
      .where(eq(sessionItems.sessionId, item.sessionId))
      .all();
    const sessionCompleted = allItems.length > 0 && allItems.every((sessionItem) => (
      (sessionItem.id === command.sessionItemId && score.correct)
      || tx.select({ id: attempts.id })
        .from(attempts)
        .where(and(
          eq(attempts.sessionItemId, sessionItem.id),
          eq(attempts.isCorrect, true),
        ))
        .limit(1)
        .get() !== undefined
    ));

    tx.insert(attempts).values({
      id: randomUUID(),
      sessionItemId: command.sessionItemId,
      clientSubmissionId: command.clientSubmissionId,
      answerText: command.answerText,
      isCorrect: score.correct,
      normalizedAnswer: score.normalizedAnswer,
      explanation: item.explanation,
      sessionCompleted,
      submittedAt: now,
    }).run();

    if (sessionCompleted) {
      tx.update(trainingSessions).set({ status: "completed", completedAt: now })
        .where(eq(trainingSessions.id, item.sessionId))
        .run();
    }

    return {
      ...score,
      explanation: item.explanation,
      sessionCompleted,
    };
  }, { behavior: "immediate" });
}
