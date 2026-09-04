import { and, asc, desc, eq } from "drizzle-orm";
import { phase2Catalog } from "@/content/phase2-catalog";
import type { AppDatabase } from "@/db/client";
import { attempts, errorObservations, learningPlans, masteryEvidence, masteryStates, parentPreferences, planTargets, questionInstances, questionTemplates, reviewSchedules, sessionItems, skills, trainingSessions } from "@/db/schema";
import { errorCategory } from "@/domain/errors/classify-error";
import { allocateComposition, type SpecialistFocus } from "@/domain/scheduling/allocate-composition";
import { selectDailyItems } from "@/domain/scheduling/select-daily-items";
import { addShanghaiDays, shanghaiDateKey, shanghaiWeekKey } from "@/domain/time/shanghai-calendar";

type Focus = "none" | "computation" | "equation" | "reading";
type Errors = { knowledge: number; habit: number; unknown: number };
export type PlanDashboard = {
  plan: { version: number; revision: number; currentWeek: number; startsOn: string; endsOn: string; weeks: Array<{ week: number; targets: number; assessment: boolean; replanAfter: boolean }> } | null;
  preferences: { trainingWeekdays: number[]; targetMinutes: number; specialistFocus: Focus };
  nextSevenDays: Array<{ date: string; kind: "training" | "rest"; preview: "dry-run"; items: Array<{ category: string; reason: string }> }>;
  weeklyReport: { firstAnswered: number; firstCorrect: number; corrected: number; hinted: number; dueReview: number; errors: Errors };
};
function weekdays(raw: string) { try { const v: unknown = JSON.parse(raw); if (Array.isArray(v) && v.length === 5 && new Set(v).size === 5 && v.every((x) => Number.isInteger(x) && x >= 1 && x <= 7)) return v as number[]; } catch {} return [1, 2, 3, 4, 5]; }
function dow(date: string) { return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; }
function planWeek(startsOn: string, date: string) { return Math.min(6, Math.max(1, Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`)) / 604_800_000) + 1)); }
function within(timestamp: number, start: string) { const day = shanghaiDateKey(timestamp); return day >= start && day <= addShanghaiDays(start, 6); }
const reflectionCause = { did_not_read: "incomplete_reading", missed_condition_or_unit: "missing_unit", calculation_slip: "calculation", method_unknown: "relationship" } as const;

export function getPlanDashboard(db: AppDatabase, childId: string, now: Date | number = Date.now()): PlanDashboard {
  return db.transaction((tx) => {
    const today = shanghaiDateKey(now), start = shanghaiWeekKey(now);
    const plan = tx.select().from(learningPlans).where(and(eq(learningPlans.childId, childId), eq(learningPlans.status, "active"))).orderBy(desc(learningPlans.version), desc(learningPlans.revision)).get();
    const pref = tx.select().from(parentPreferences).where(eq(parentPreferences.childId, childId)).get(); const days = weekdays(pref?.trainingWeekdays ?? ""), focus = (pref?.specialistFocus ?? "none") as Focus, minutes = pref?.targetMinutes ?? 30;
    const attemptsRows = tx.select({ attempt: attempts, itemId: sessionItems.id }).from(attempts).innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id)).innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id)).where(eq(trainingSessions.childId, childId)).orderBy(asc(attempts.submittedAt), asc(attempts.id)).all();
    const first = new Map<string, typeof attemptsRows[number]>(); for (const row of attemptsRows) if (!first.has(row.itemId)) first.set(row.itemId, row);
    const evidence = tx.select().from(masteryEvidence).where(eq(masteryEvidence.childId, childId)).all();
    const observationRows = tx.select().from(errorObservations).where(eq(errorObservations.childId, childId)).orderBy(asc(errorObservations.observedAt), asc(errorObservations.id)).all(); const childOf = new Map(observationRows.map((row) => [row.previousObservationId, row]));
    const errors = observationRows.filter((row) => row.source === "system" && within(row.observedAt, start)).reduce<Errors>((total, root) => { let final = root; while (childOf.has(final.id)) final = childOf.get(final.id)!; const cause = final.parentCorrection ?? (final.childSelfReport ? reflectionCause[final.childSelfReport] : null) ?? root.systemCandidate ?? "unknown"; total[errorCategory(cause)]++; return total; }, { knowledge: 0, habit: 0, unknown: 0 });
    const rank = new Map(tx.select().from(masteryStates).where(eq(masteryStates.childId, childId)).all().map((row) => [row.skillId, ({ needs_support: 0, learning: 1, basic: 2, stable: 3, undiagnosed: 4 } as const)[row.status]])); const due = new Map(tx.select().from(reviewSchedules).where(eq(reviewSchedules.childId, childId)).all().filter((row) => row.dueOn <= today).map((row) => [row.skillId, row]));
    const targetIds = new Set(plan ? tx.select({ skillId: planTargets.skillId }).from(planTargets).where(and(eq(planTargets.planId, plan.id), eq(planTargets.weekNumber, planWeek(plan.startsOn, today)), eq(planTargets.category, "weakness"))).all().flatMap((row) => row.skillId ? [row.skillId] : []) : []); const catalog = new Set(phase2Catalog.map((row) => row.id));
    const candidates = tx.select({ questionInstanceId: questionInstances.id, templateId: questionTemplates.id, skillId: questionInstances.skillId, structureTag: questionTemplates.structureTag, difficulty: questionInstances.difficulty, estimatedSeconds: questionTemplates.estimatedSeconds, domain: skills.domain, lastUsedAt: questionInstances.lastUsedAt }).from(questionInstances).innerJoin(questionTemplates, eq(questionInstances.templateId, questionTemplates.id)).innerJoin(skills, eq(questionInstances.skillId, skills.id)).where(and(eq(questionInstances.active, true), eq(questionTemplates.active, true))).all().filter((row) => catalog.has(row.templateId)).map((row) => ({ ...row, difficulty: row.difficulty as 1 | 2 | 3 | 4, dueOn: due.get(row.skillId)?.dueOn ?? null, masteryRank: rank.get(row.skillId) ?? 4, targetDifficulty: Math.min(4, (rank.get(row.skillId) ?? 3) + 1) as 1 | 2 | 3 | 4, category: due.has(row.skillId) ? "review" as const : targetIds.has(row.skillId) ? "weakness" as const : row.domain === "thinking_habits" ? "reading" as const : "extension" as const }));
    const preview = (date: string) => days.includes(dow(date)) ? selectDailyItems({ candidates, composition: allocateComposition(Math.max(15, Math.round(minutes * 60 / 90)), focus as SpecialistFocus), targetSeconds: minutes * 60, date, seed: `${date}:${plan?.id ?? "none"}:${plan?.revision ?? 0}` }).items.map((item) => ({ category: item.category, reason: item.selectionReason })) : [];
    const weeks = plan ? Array.from({ length: 6 }, (_, i) => ({ week: i + 1, targets: tx.select().from(planTargets).where(and(eq(planTargets.planId, plan.id), eq(planTargets.weekNumber, i + 1))).all().length, assessment: i === 3, replanAfter: i === 5 })) : [];
    return { plan: plan ? { version: plan.version, revision: plan.revision, currentWeek: planWeek(plan.startsOn, today), startsOn: plan.startsOn, endsOn: plan.endsOn, weeks } : null, preferences: { trainingWeekdays: days, targetMinutes: minutes, specialistFocus: focus }, nextSevenDays: Array.from({ length: 7 }, (_, i) => { const date = addShanghaiDays(today, i), items = preview(date); return { date, kind: items.length || days.includes(dow(date)) ? "training" as const : "rest" as const, preview: "dry-run" as const, items }; }), weeklyReport: { firstAnswered: [...first.values()].filter((row) => within(row.attempt.submittedAt, start)).length, firstCorrect: [...first.values()].filter((row) => within(row.attempt.submittedAt, start) && row.attempt.isCorrect).length, corrected: attemptsRows.filter((row) => within(row.attempt.submittedAt, start) && (row.attempt.correctionNumber ?? 0) > 0 && row.attempt.isCorrect).length, hinted: evidence.filter((row) => (row.hintLevel ?? 0) > 0 && row.occurredOn >= start && row.occurredOn <= addShanghaiDays(start, 6)).length, dueReview: evidence.filter((row) => row.purpose === "review" && row.occurredOn >= start && row.occurredOn <= addShanghaiDays(start, 6)).length, errors } };
  });
}
