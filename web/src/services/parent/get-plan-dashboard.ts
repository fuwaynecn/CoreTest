import { and, asc, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { attempts, errorObservations, learningPlans, masteryEvidence, parentPreferences, sessionItems, trainingSessions } from "@/db/schema";
import { errorCategory } from "@/domain/errors/classify-error";
import { addShanghaiDays, shanghaiDateKey, shanghaiWeekKey } from "@/domain/time/shanghai-calendar";

export type PlanDashboard = {
  plan: { version: number; revision: number; currentWeek: number; startsOn: string; endsOn: string } | null;
  preferences: { trainingWeekdays: number[]; targetMinutes: number; specialistFocus: "none" | "computation" | "equation" | "reading" };
  nextSevenDays: Array<{ date: string; kind: "training" | "rest"; preview: "dry-run" }>;
  weeklyReport: { firstAnswered: number; firstCorrect: number; corrected: number; hinted: number; dueReview: number; errors: { knowledge: number; habit: number; unknown: number } };
};

function weekdays(raw: string) {
  try { const value: unknown = JSON.parse(raw); if (Array.isArray(value) && value.length === 5 && new Set(value).size === 5 && value.every((day) => Number.isInteger(day) && day >= 1 && day <= 7)) return value as number[]; } catch { /* legacy preference */ }
  return [1, 2, 3, 4, 5];
}
function dayOfWeek(date: string) { return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; }
function currentWeek(startsOn: string, date: string) { return Math.min(6, Math.max(1, Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`)) / 604_800_000) + 1)); }

export function getPlanDashboard(db: AppDatabase, childId: string, now: Date | number = Date.now()): PlanDashboard {
  return db.transaction((tx) => {
    const today = shanghaiDateKey(now); const weekStart = shanghaiWeekKey(now);
    const plan = tx.select().from(learningPlans).where(and(eq(learningPlans.childId, childId), eq(learningPlans.status, "active"))).orderBy(desc(learningPlans.version), desc(learningPlans.revision)).get();
    const preference = tx.select().from(parentPreferences).where(eq(parentPreferences.childId, childId)).get();
    const trainingWeekdays = weekdays(preference?.trainingWeekdays ?? "");
    const sessionRows = tx.select({ attempt: attempts, itemId: sessionItems.id, date: trainingSessions.sessionDate })
      .from(attempts).innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id)).innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(trainingSessions.childId, childId)).orderBy(asc(attempts.submittedAt), asc(attempts.id)).all();
    const firstByItem = new Map<string, typeof sessionRows[number]>();
    for (const row of sessionRows) if (!firstByItem.has(row.itemId) && row.date >= weekStart && row.date <= addShanghaiDays(weekStart, 6)) firstByItem.set(row.itemId, row);
    const weeklyAttempts = [...firstByItem.values()];
    const evidence = tx.select({ itemId: masteryEvidence.sessionItemId, purpose: masteryEvidence.purpose, hintLevel: masteryEvidence.hintLevel })
      .from(masteryEvidence).where(eq(masteryEvidence.childId, childId)).all();
    const weeklyItemIds = new Set(weeklyAttempts.map((row) => row.itemId));
    const errorRows = tx.select().from(errorObservations).where(eq(errorObservations.childId, childId)).all();
    const roots = errorRows.filter((row) => row.source === "system" && weeklyItemIds.has(row.sessionItemId));
    const errors = roots.reduce((total, root) => { const latest = errorRows.filter((row) => row.previousObservationId === root.id).at(-1); total[errorCategory(latest?.parentCorrection ?? root.systemCandidate ?? "unknown")] += 1; return total; }, { knowledge: 0, habit: 0, unknown: 0 });
    return {
      plan: plan ? { version: plan.version, revision: plan.revision, currentWeek: currentWeek(plan.startsOn, today), startsOn: plan.startsOn, endsOn: plan.endsOn } : null,
      preferences: { trainingWeekdays, targetMinutes: preference?.targetMinutes ?? 30, specialistFocus: (preference?.specialistFocus ?? "none") as PlanDashboard["preferences"]["specialistFocus"] },
      nextSevenDays: Array.from({ length: 7 }, (_, index) => { const date = addShanghaiDays(today, index); return { date, kind: trainingWeekdays.includes(dayOfWeek(date)) ? "training" as const : "rest" as const, preview: "dry-run" as const }; }),
      weeklyReport: { firstAnswered: weeklyAttempts.length, firstCorrect: weeklyAttempts.filter((row) => row.attempt.isCorrect).length, corrected: sessionRows.filter((row) => weeklyItemIds.has(row.itemId) && (row.attempt.correctionNumber ?? 0) > 0 && row.attempt.isCorrect).length, hinted: evidence.filter((row) => weeklyItemIds.has(row.itemId) && (row.hintLevel ?? 0) > 0).length, dueReview: evidence.filter((row) => weeklyItemIds.has(row.itemId) && row.purpose === "review").length, errors },
    };
  });
}
