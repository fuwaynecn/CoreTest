import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  diagnosticRuns, dosageStates, learningPlans, masteryStates, parentPreferences,
  planTargets, reviewSchedules, skills,
} from "@/db/schema";
import { dosageTrackForDomain } from "@/domain/dosage/dosage-track";
import { buildSixWeekPlan, type SixWeekPlanDraft } from "@/domain/planning/build-six-week-plan";
import { shanghaiDateKey, shanghaiWeekKey } from "@/domain/time/shanghai-calendar";

type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
type SpecialistFocus = "none" | "computation" | "equation" | "reading";

export class LearningPlanStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningPlanStateError";
  }
}

function activePlan(tx: AppTransaction, childId: string) {
  return tx.select().from(learningPlans).where(and(
    eq(learningPlans.childId, childId), eq(learningPlans.status, "active"),
  )).orderBy(desc(learningPlans.version), desc(learningPlans.revision)).limit(1).get();
}

function normalizedWeekdays(days: number[]) {
  return JSON.stringify([...days].sort((left, right) => left - right));
}

function latestCompletedDiagnosis(tx: AppTransaction, childId: string) {
  return tx.select().from(diagnosticRuns).where(and(
    eq(diagnosticRuns.childId, childId), eq(diagnosticRuns.status, "completed"),
  )).orderBy(desc(diagnosticRuns.version)).limit(1).get();
}

function draftFor(tx: AppTransaction, childId: string, startsOn: string, specialistFocus?: SpecialistFocus) {
  const diagnosis = latestCompletedDiagnosis(tx, childId);
  if (!diagnosis) throw new LearningPlanStateError("A completed diagnosis is required");
  const preferences = tx.select().from(parentPreferences).where(eq(parentPreferences.childId, childId)).get();
  const focus = specialistFocus ?? preferences?.specialistFocus ?? "none";
  const mastery = tx.select({ skillId: masteryStates.skillId, status: masteryStates.status,
    evidenceCount: masteryStates.evidenceCount, domain: skills.domain })
    .from(masteryStates).innerJoin(skills, eq(masteryStates.skillId, skills.id))
    .where(eq(masteryStates.childId, childId)).all().map((row) => ({
      ...row, track: dosageTrackForDomain(row.domain),
    }));
  const dosage = tx.select().from(dosageStates).where(eq(dosageStates.childId, childId)).all().map((row) => ({
    track: row.track, minimum: row.sessionMinimum, target: row.sessionTarget, maximum: row.sessionMaximum,
  }));
  const dueReviews = tx.select({ skillId: reviewSchedules.skillId, dueOn: reviewSchedules.dueOn })
    .from(reviewSchedules).where(eq(reviewSchedules.childId, childId)).all();
  return buildSixWeekPlan({
    startsOn, diagnosis: { id: diagnosis.id, report: diagnosis.reportSnapshot ?? {} }, mastery, dosage, dueReviews,
    preferences: { specialistFocus: focus },
  });
}

function insertPlan(
  tx: AppTransaction, childId: string, diagnosisRunId: string, version: number, revision: number,
  draft: SixWeekPlanDraft, now: number,
) {
  const id = randomUUID();
  tx.insert(learningPlans).values({
    id, childId, diagnosisRunId, version, revision, status: "active", startsOn: draft.startsOn,
    endsOn: draft.endsOn, reasonSnapshot: draft.reasonSnapshot, createdAt: now,
  }).run();
  tx.insert(planTargets).values(draft.weeks.flatMap((week) => week.targets.map((target) => ({
    planId: id, weekNumber: week.week, targetKey: target.key, skillId: target.skillId, track: target.track,
    category: target.category, minimum: target.minimum, target: target.target, maximum: target.maximum,
    reasonCode: target.reasonCode,
  })))).run();
  return tx.select().from(learningPlans).where(eq(learningPlans.id, id)).get()!;
}

export function createInitialPlan(db: AppDatabase, childId: string, now: Date | number = Date.now(), createdAt = Date.now()) {
  return db.transaction((tx) => {
    const existing = activePlan(tx, childId);
    if (existing) return existing;
    const diagnosis = latestCompletedDiagnosis(tx, childId);
    if (!diagnosis) throw new LearningPlanStateError("A completed diagnosis is required");
    const draft = draftFor(tx, childId, shanghaiWeekKey(now));
    return insertPlan(tx, childId, diagnosis.id, 1, 1, draft, createdAt);
  }, { behavior: "immediate" });
}

export function reviseActivePlan(
  db: AppDatabase, childId: string, preferences: { specialistFocus: SpecialistFocus; trainingWeekdays?: number[]; targetMinutes?: number }, now = Date.now(),
) {
  return db.transaction((tx) => {
    const active = activePlan(tx, childId);
    if (!active) throw new LearningPlanStateError("No active learning plan exists");
    const current = tx.select().from(parentPreferences).where(eq(parentPreferences.childId, childId)).get();
    const trainingWeekdays = preferences.trainingWeekdays && normalizedWeekdays(preferences.trainingWeekdays);
    if (trainingWeekdays && preferences.targetMinutes && current
      && current.trainingWeekdays === trainingWeekdays
      && current.targetMinutes === preferences.targetMinutes
      && current.specialistFocus === preferences.specialistFocus) return active;
    if (trainingWeekdays && preferences.targetMinutes) tx.insert(parentPreferences).values({
      childId, trainingWeekdays, targetMinutes: preferences.targetMinutes,
      specialistFocus: preferences.specialistFocus, updatedAt: now,
    }).onConflictDoUpdate({ target: parentPreferences.childId, set: { trainingWeekdays, targetMinutes: preferences.targetMinutes, specialistFocus: preferences.specialistFocus, updatedAt: now } }).run();
    tx.update(learningPlans).set({ status: "superseded" }).where(eq(learningPlans.id, active.id)).run();
    const draft = draftFor(tx, childId, active.startsOn, preferences.specialistFocus);
    return insertPlan(tx, childId, active.diagnosisRunId, active.version, active.revision + 1, draft, now);
  }, { behavior: "immediate" });
}

export function rollPlanAfterWeekSix(db: AppDatabase, childId: string, now: Date | number = Date.now(), createdAt = Date.now()) {
  return db.transaction((tx) => {
    const active = activePlan(tx, childId);
    if (!active) throw new LearningPlanStateError("No active learning plan exists");
    if (shanghaiDateKey(now) <= active.endsOn) throw new LearningPlanStateError("The active plan has not completed week six");
    tx.update(learningPlans).set({ status: "completed" }).where(eq(learningPlans.id, active.id)).run();
    const diagnosis = latestCompletedDiagnosis(tx, childId);
    if (!diagnosis) throw new LearningPlanStateError("A completed diagnosis is required");
    const draft = draftFor(tx, childId, shanghaiWeekKey(now));
    return insertPlan(tx, childId, diagnosis.id, active.version + 1, 1, draft, createdAt);
  }, { behavior: "immediate" });
}
