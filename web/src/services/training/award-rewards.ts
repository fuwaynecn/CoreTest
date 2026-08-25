import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { rewardEvents } from "@/db/schema";
import { earnedBadges, pointValues, type BadgeCounts } from "@/domain/rewards/reward-rules";

export type RewardSummary = { pointsEarned: number; totalPoints: number; newBadges: Array<{ code: string; label: string }> };
type Tx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

type RewardInput = {
  childId: string; sessionId: string; sessionKind: string; sessionItemId: string; attemptId: string;
  priorAttemptCount: number; correct: boolean; sessionCompleted: boolean; metadataSnapshot: string;
  hadIncorrectPrior: boolean; structureTagSnapshot: string;
  readingCardResponse?: { units: string; relationship: string };
  occurredAt: number;
};

function metadata(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

function insertReward(tx: Tx, values: Omit<typeof rewardEvents.$inferInsert, "id">) {
  return tx.insert(rewardEvents).values({ id: randomUUID(), metadata: "{}", ...values })
    .onConflictDoNothing({ target: rewardEvents.sourceKey }).run().changes > 0;
}

export function awardSessionCompletion(tx: Tx, input: {
  childId: string; sessionId: string; attemptId?: string; occurredAt: number;
}) {
  return insertReward(tx, {
    childId: input.childId,
    sourceKey: `session-completed:${input.sessionId}`,
    kind: "points",
    code: "session-completed",
    points: pointValues.plannedSessionCompleted,
    sessionId: input.sessionId,
    attemptId: input.attemptId,
    occurredAt: input.occurredAt,
  }) ? pointValues.plannedSessionCompleted : 0;
}

export function awardRewards(tx: Tx, input: RewardInput): RewardSummary {
  const meta = metadata(input.metadataSnapshot);
  let pointsEarned = 0;
  const add = (code: string, points: number, sourceKey: string) => {
    if (insertReward(tx, { childId: input.childId, sourceKey, kind: "points", code, points, sessionId: input.sessionId, attemptId: input.attemptId, occurredAt: input.occurredAt })) pointsEarned += points;
  };

  const reading = input.priorAttemptCount === 0 && meta.readingCard === true && !!input.readingCardResponse;
  if (reading) add("reading-card", pointValues.readingCardCompleted, `reading-card:${input.sessionItemId}`);
  if (reading && input.readingCardResponse!.relationship.trim()) add("relationship", pointValues.relationshipExplained, `relationship:${input.sessionItemId}`);
  if (input.hadIncorrectPrior && input.correct) add("correction", pointValues.correctionSucceeded, `correction:${input.childId}:${input.sessionItemId}`);
  const review = input.sessionKind === "review" || meta.category === "review" || meta.selectionReason === "due_review" || meta.selectionReason === "overdue_review";
  if (input.priorAttemptCount === 0 && input.correct && review) add("review-recall", pointValues.firstCorrectReviewRecall, `review-recall:${input.sessionItemId}`);
  if (input.sessionCompleted && input.sessionKind !== "practice" && input.sessionKind !== "diagnostic") pointsEarned += awardSessionCompletion(tx, input);

  const all = tx.select({ code: rewardEvents.code }).from(rewardEvents).where(eq(rewardEvents.childId, input.childId)).all();
  const counts: BadgeCounts = {
    readingCards: all.filter((row) => row.code === "reading-card").length,
    nonEmptyUnitChecks: all.filter((row) => row.code === "unit-check").length,
    correctEquationItems: all.filter((row) => row.code === "correct-equation").length,
    correctEstimateItems: all.filter((row) => row.code === "correct-estimate").length,
  };
  if (reading && input.readingCardResponse!.units.trim()) add("unit-check", 0, `unit-check:${input.sessionItemId}`);
  const equation = meta.dosageTrack === "equation" || String(meta.structureTag ?? "").includes("equation") || input.structureTagSnapshot.includes("equation");
  const estimate = meta.estimate === true || String(meta.structureTag ?? "").includes("estimate") || input.structureTagSnapshot.includes("estimate");
  if (input.correct && equation) add("correct-equation", 0, `correct-equation:${input.sessionItemId}`);
  if (input.correct && estimate) add("correct-estimate", 0, `correct-estimate:${input.sessionItemId}`);
  const refreshed = tx.select({ code: rewardEvents.code }).from(rewardEvents).where(eq(rewardEvents.childId, input.childId)).all();
  counts.readingCards = refreshed.filter((row) => row.code === "reading-card").length;
  counts.nonEmptyUnitChecks = refreshed.filter((row) => row.code === "unit-check").length;
  counts.correctEquationItems = refreshed.filter((row) => row.code === "correct-equation").length;
  counts.correctEstimateItems = refreshed.filter((row) => row.code === "correct-estimate").length;
  const newBadges: Array<{ code: string; label: string }> = [];
  for (const badge of earnedBadges(counts)) {
    const sourceKey = `badge:${input.childId}:${badge.code}`;
    if (insertReward(tx, { childId: input.childId, sourceKey, kind: "badge", code: badge.code, points: 0, sessionId: input.sessionId, attemptId: input.attemptId, occurredAt: input.occurredAt, metadata: JSON.stringify({ label: badge.label }) })) newBadges.push({ code: badge.code, label: badge.label });
  }
  const totalPoints = tx.select({ total: sql<number>`coalesce(sum(${rewardEvents.points}), 0)` }).from(rewardEvents).where(eq(rewardEvents.childId, input.childId)).get()!.total;
  return { pointsEarned, totalPoints, newBadges };
}
