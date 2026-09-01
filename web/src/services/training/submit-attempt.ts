import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  hintEvents,
  masteryEvidence,
  rewardEvents,
  sessionItems,
  trainingSessions,
} from "@/db/schema";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { scoreAnswer } from "@/domain/questions/score-answer";
import { dosageTrackForDomain } from "@/domain/dosage/dosage-track";
import { normalizeTelemetry } from "@/domain/training/attempt-telemetry";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { recordSystemErrorObservation } from "./error-observation-service";
import { recordLearningEvidence } from "./record-learning-evidence";
import { updateLearningState } from "./update-learning-state";
import { awardRewards, type RewardSummary } from "./award-rewards";

export type SubmitAttemptCommand = {
  childId: string;
  sessionItemId: string;
  clientSubmissionId: string;
  answerText: string;
  activeDurationMs?: number;
  hintLevel?: number;
  hintCount?: number;
  readingCardResponse?: { target: string; givens: string; units: string; usefulFacts: string; relationship: string; estimateRange: string };
};

export type AttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  sessionCompleted: boolean;
  rewards: RewardSummary;
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

function estimatedSecondsFromSnapshot(raw: string): number {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "estimatedSeconds" in parsed
      && typeof parsed.estimatedSeconds === "number" && Number.isFinite(parsed.estimatedSeconds)
      && parsed.estimatedSeconds > 0) {
      return parsed.estimatedSeconds;
    }
  } catch {
    // Legacy snapshots can predate estimated-time metadata.
  }
  return 300;
}

function dosageTrackFromSnapshot(raw: string) {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "dosageTrack" in parsed) {
      if (parsed.dosageTrack === "computation" || parsed.dosageTrack === "equation") {
        return parsed.dosageTrack;
      }
      if (parsed.dosageTrack === null) return null;
    }
    if (typeof parsed === "object" && parsed !== null && "domain" in parsed) {
      return dosageTrackForDomain(parsed.domain);
    }
  } catch {
    // Legacy snapshots do not have a frozen dosage classification.
  }
  return null;
}

function evidenceClassification(sessionKind: string, raw: string) {
  let metadata: { category?: unknown; selectionReason?: unknown; reviewIntervalDays?: unknown } = {};
  try { metadata = JSON.parse(raw) as typeof metadata; } catch { /* Legacy snapshots are learning items. */ }
  const review = sessionKind === "review" || metadata.category === "review" || metadata.selectionReason === "due_review" || metadata.selectionReason === "overdue_review";
  if (review) {
    if (![1, 3, 7, 14, 30].includes(metadata.reviewIntervalDays as number)) throw new Error("Review item interval snapshot is invalid");
    return { purpose: "review" as const, reviewIntervalDays: metadata.reviewIntervalDays as 1 | 3 | 7 | 14 | 30 };
  }
  return sessionKind === "assessment"
    ? { purpose: "assessment" as const, reviewIntervalDays: 0 as const }
    : { purpose: "learning" as const, reviewIntervalDays: 0 as const };
}

function needsReadingCard(raw: string) {
  try { return JSON.parse(raw).readingCard === true; } catch { return false; }
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
      rewardSummary: attempts.rewardSummary,
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
        rewards: parseRewardSummary(existing.rewardSummary) ?? rewardSummaryForAttempt(tx, command.childId, command.clientSubmissionId),
      };
    }

    const item = tx.select({
      sessionId: trainingSessions.id,
      sessionKind: trainingSessions.kind,
      skillId: sessionItems.skillIdSnapshot,
      templateId: sessionItems.questionTemplateId,
      difficulty: sessionItems.difficultySnapshot,
      stem: sessionItems.stemSnapshot,
      structureTag: sessionItems.structureTagSnapshot,
      answerSpec: sessionItems.answerSpecSnapshot,
      explanation: sessionItems.explanationSnapshot,
      metadataSnapshot: sessionItems.selectionReasonSnapshot,
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
    if (needsReadingCard(item.metadataSnapshot) && (!command.readingCardResponse || Object.values(command.readingCardResponse).some((value) => !value.trim()))) throw new InvalidAnswerError();

    const persistedHints = tx.select({ level: hintEvents.hintLevel }).from(hintEvents)
      .where(and(
        eq(hintEvents.sessionItemId, command.sessionItemId),
        eq(hintEvents.childId, command.childId),
      ))
      .all();
    const hintCount = Math.min(persistedHints.length, 3);
    const hintLevel = persistedHints.reduce((highest, event) => (
      Math.max(highest, event.level)
    ), 0);
    const telemetry = normalizeTelemetry({
      activeDurationMs: command.activeDurationMs ?? 0,
      hintLevel,
      hintCount,
    }, estimatedSecondsFromSnapshot(item.metadataSnapshot));

    const score = scoreAnswer(command.answerText, parseAnswerSpec(item.answerSpec));
    const now = Date.now();
    const priorAttemptCount = tx.select({ id: attempts.id }).from(attempts)
      .where(eq(attempts.sessionItemId, command.sessionItemId)).all().length;
    const hadIncorrectPrior = tx.select({ id: attempts.id }).from(attempts)
      .where(and(eq(attempts.sessionItemId, command.sessionItemId), eq(attempts.isCorrect, false))).get() !== undefined;
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

    const attemptId = randomUUID();
    tx.insert(attempts).values({
      id: attemptId,
      sessionItemId: command.sessionItemId,
      clientSubmissionId: command.clientSubmissionId,
      answerText: command.answerText,
      isCorrect: score.correct,
      normalizedAnswer: score.normalizedAnswer,
      explanation: item.explanation,
      sessionCompleted,
      ...telemetry,
      correctionNumber: priorAttemptCount,
      readingCardResponse: priorAttemptCount === 0 && command.readingCardResponse ? JSON.stringify(command.readingCardResponse) : null,
      submittedAt: now,
    }).run();

    if (sessionCompleted) {
      tx.update(trainingSessions).set({ status: "completed", completedAt: now })
        .where(eq(trainingSessions.id, item.sessionId))
        .run();
    }

    if (priorAttemptCount === 0 && item.sessionKind !== "practice") {
      const { purpose, reviewIntervalDays } = evidenceClassification(item.sessionKind, item.metadataSnapshot);
      recordLearningEvidence(tx, {
        childId: command.childId,
        skillId: item.skillId,
        sessionItemId: command.sessionItemId,
        templateId: item.templateId,
        purpose,
        firstAttemptCorrect: score.correct,
        independent: hintCount === 0,
        hintLevel: hintLevel as 0 | 1 | 2 | 3,
        dosageTrack: dosageTrackFromSnapshot(item.metadataSnapshot),
        difficulty: item.difficulty as 1 | 2 | 3 | 4,
        structureTag: item.structureTag,
        occurredOn: shanghaiDateKey(now),
        occurredAt: now,
        diagnosticRunId: null,
        diagnosticCompletedOn: null,
        diagnosticCompletedAt: null,
        reviewIntervalDays,
      });
    } else if (priorAttemptCount > 0 && item.sessionKind !== "practice") {
      const evidence = tx.select({ id: masteryEvidence.id }).from(masteryEvidence)
        .where(eq(masteryEvidence.sessionItemId, command.sessionItemId)).get();
      if (!evidence) throw new Error("Formal correction is missing first-attempt evidence");
      updateLearningState(tx, evidence.id);
    }

    if (!score.correct && priorAttemptCount === 0) {
      recordSystemErrorObservation(tx, {
        childId: command.childId, sessionItemId: command.sessionItemId, attemptId,
        answerText: command.answerText, answerSpecSnapshot: item.answerSpec,
        stemSnapshot: item.stem, structureTagSnapshot: item.structureTag,
        selectionReasonSnapshot: item.metadataSnapshot, now,
      });
    }

    const rewards = awardRewards(tx, {
      childId: command.childId,
      sessionId: item.sessionId,
      sessionKind: item.sessionKind,
      sessionItemId: command.sessionItemId,
      skillId: item.skillId,
      attemptId,
      priorAttemptCount,
      hadIncorrectPrior,
      structureTagSnapshot: item.structureTag,
      correct: score.correct,
      sessionCompleted,
      metadataSnapshot: item.metadataSnapshot,
      readingCardResponse: command.readingCardResponse,
      occurredAt: now,
    });
    tx.update(attempts).set({ rewardSummary: JSON.stringify(rewards) }).where(eq(attempts.id, attemptId)).run();

    return {
      ...score,
      explanation: item.explanation,
      sessionCompleted,
      rewards,
    };
  }, { behavior: "immediate" });
}

function parseRewardSummary(raw: string | null): RewardSummary | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RewardSummary>;
    if (typeof value.pointsEarned === "number" && typeof value.totalPoints === "number" && Array.isArray(value.newBadges)) return value as RewardSummary;
  } catch { /* Fall back for attempts persisted before reward snapshots. */ }
  return null;
}

function rewardSummaryForAttempt(tx: Parameters<Parameters<AppDatabase["transaction"]>[0]>[0], childId: string, submissionId: string): RewardSummary {
  const events = tx.select({ kind: rewardEvents.kind, code: rewardEvents.code, points: rewardEvents.points, attemptId: rewardEvents.attemptId, metadata: rewardEvents.metadata })
    .from(rewardEvents).where(eq(rewardEvents.childId, childId)).all();
  const attempt = tx.select({ id: attempts.id, submittedAt: attempts.submittedAt }).from(attempts).where(eq(attempts.clientSubmissionId, submissionId)).get();
  const owned = events.filter((event) => event.kind === "points" && event.points > 0 && event.attemptId === attempt?.id);
  const priorAttemptIds = new Set(tx.select({ id: attempts.id }).from(attempts)
    .where(sql`${attempts.submittedAt} <= ${attempt!.submittedAt}`).all().map((row) => row.id));
  const totalPoints = events.filter((event) => event.attemptId !== null && priorAttemptIds.has(event.attemptId)).reduce((sum, event) => sum + event.points, 0);
  const newBadges = events.filter((event) => event.kind === "badge" && event.attemptId === attempt?.id)
    .map((event) => ({ code: event.code, label: (JSON.parse(event.metadata) as { label?: string }).label ?? event.code }));
  return { pointsEarned: owned.reduce((sum, event) => sum + event.points, 0), totalPoints, newBadges };
}
