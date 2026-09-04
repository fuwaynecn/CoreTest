import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { phase2Catalog } from "@/content/phase2-catalog";
import type { AppDatabase } from "@/db/client";
import { attempts, diagnosticRuns, learningPlans, masteryStates, parentPreferences, planTargets, questionInstances, questionTemplates, reviewSchedules, sessionItems, skills, trainingSessions } from "@/db/schema";
import { allocateComposition, type SpecialistFocus } from "@/domain/scheduling/allocate-composition";
import { selectDailyItems } from "@/domain/scheduling/select-daily-items";
import { REVIEW_DAYS } from "@/domain/review/next-review";
import { ensureQuestionBankFresh } from "@/services/questions/question-bank-refresh";
import type { SessionView } from "@/domain/training/types";

export class DiagnosisRequiredError extends Error {
  constructor() { super("Diagnosis must be completed before adaptive training"); this.name = "DiagnosisRequiredError"; }
}
export class ActivePlanRequiredError extends Error {
  constructor() { super("An active learning plan is required"); this.name = "ActivePlanRequiredError"; }
}

function weekNumber(startsOn: string, date: string) {
  return Math.min(6, Math.max(1, Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`)) / 604_800_000) + 1));
}

function trainingWeekdays(raw: string | undefined) {
  try {
    const parsed: unknown = raw && JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length && parsed.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
      return [...new Set(parsed)].sort((left, right) => (left || 7) - (right || 7));
    }
  } catch { /* Default training weekdays keep Phase 1's weekday convention. */ }
  return [1, 2, 3, 4, 5];
}

function isAssessmentDay(date: string, week: number, weekdays: number[]) {
  return week === 4 && new Date(`${date}T12:00:00+08:00`).getUTCDay() === weekdays.at(-1);
}

function schedulingTargetSkills(db: AppDatabase, childId: string, date: string) {
  return db.transaction((tx) => {
    const diagnosis = tx.select({ id: diagnosticRuns.id }).from(diagnosticRuns).where(and(eq(diagnosticRuns.childId, childId), eq(diagnosticRuns.status, "completed"))).orderBy(desc(diagnosticRuns.version)).get();
    if (!diagnosis) throw new DiagnosisRequiredError();
    const plan = tx.select().from(learningPlans).where(and(eq(learningPlans.childId, childId), eq(learningPlans.status, "active"))).orderBy(desc(learningPlans.version), desc(learningPlans.revision)).get();
    if (!plan) throw new ActivePlanRequiredError();
    const existing = tx.select({ id: trainingSessions.id }).from(trainingSessions).where(and(eq(trainingSessions.childId, childId), eq(trainingSessions.sessionDate, date), inArray(trainingSessions.kind, ["daily", "assessment"]))).get();
    const week = weekNumber(plan.startsOn, date);
    const due = tx.select({ skillId: reviewSchedules.skillId, dueOn: reviewSchedules.dueOn }).from(reviewSchedules).where(eq(reviewSchedules.childId, childId)).all();
    const planned = tx.select({ skillId: planTargets.skillId }).from(planTargets).where(and(eq(planTargets.planId, plan.id), eq(planTargets.weekNumber, week))).all();
    return { existingId: existing?.id ?? null, skillIds: [...new Set([...due.filter((row) => row.dueOn <= date).map((row) => row.skillId), ...planned.flatMap((row) => row.skillId ? [row.skillId] : [])])] };
  });
}

function sessionView(db: AppDatabase, sessionId: string): SessionView {
  return db.transaction((tx) => {
    const session = tx.select({ id: trainingSessions.id, status: trainingSessions.status }).from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get();
    if (!session) throw new Error("Training session was not found");
    const questions = tx.select({ id: sessionItems.id, position: sessionItems.position, stem: sessionItems.stemSnapshot })
      .from(sessionItems).where(eq(sessionItems.sessionId, sessionId)).orderBy(asc(sessionItems.position)).all()
      .map((item) => ({ ...item, answered: tx.select({ id: attempts.id }).from(attempts).where(and(eq(attempts.sessionItemId, item.id), eq(attempts.isCorrect, true))).get() !== undefined }));
    return { ...session, currentPosition: questions.find((item) => !item.answered)?.position ?? questions.length, questions };
  });
}

export function getOrCreateAdaptiveSession(db: AppDatabase, childId: string, date: string, now: Date | number = Date.now()): SessionView {
  const preflight = schedulingTargetSkills(db, childId, date);
  if (preflight.existingId) return sessionView(db, preflight.existingId);
  const timestamp = new Date(now).getTime();
  try { ensureQuestionBankFresh(db, date, { now: timestamp }); } catch { /* Existing active inventory remains usable when refresh fails. */ }
  const missingSkills = db.transaction((tx) => preflight.skillIds.filter((skillId) => !tx.select({ id: questionInstances.id }).from(questionInstances).innerJoin(questionTemplates, eq(questionInstances.templateId, questionTemplates.id)).where(and(eq(questionInstances.skillId, skillId), eq(questionInstances.active, true), eq(questionTemplates.active, true))).get()));
  if (missingSkills.length) {
    try { ensureQuestionBankFresh(db, date, { skillIds: missingSkills, force: true, now: timestamp }); } catch { /* Fall back to remaining active inventory. */ }
  }
  const sessionId = db.transaction((tx) => {
    const diagnosis = tx.select({ id: diagnosticRuns.id }).from(diagnosticRuns).where(and(eq(diagnosticRuns.childId, childId), eq(diagnosticRuns.status, "completed"))).orderBy(desc(diagnosticRuns.version)).get();
    if (!diagnosis) throw new DiagnosisRequiredError();
    const plan = tx.select().from(learningPlans).where(and(eq(learningPlans.childId, childId), eq(learningPlans.status, "active"))).orderBy(desc(learningPlans.version), desc(learningPlans.revision)).get();
    if (!plan) throw new ActivePlanRequiredError();
    const existing = tx.select({ id: trainingSessions.id }).from(trainingSessions).where(and(eq(trainingSessions.childId, childId), eq(trainingSessions.sessionDate, date), inArray(trainingSessions.kind, ["daily", "assessment"]))).get();
    if (existing) return existing.id;
    const week = weekNumber(plan.startsOn, date);
    const focus = tx.select({ specialistFocus: parentPreferences.specialistFocus, targetMinutes: parentPreferences.targetMinutes, trainingWeekdays: parentPreferences.trainingWeekdays }).from(parentPreferences).where(eq(parentPreferences.childId, childId)).get();
    const targetSeconds = (focus?.targetMinutes ?? 30) * 60;
    const due = tx.select().from(reviewSchedules).where(and(eq(reviewSchedules.childId, childId))).all();
    const dueBySkill = new Map(due.filter((row) => row.dueOn <= date).map((row) => [row.skillId, row]));
    const ranks = new Map(tx.select().from(masteryStates).where(eq(masteryStates.childId, childId)).all().map((row) => [row.skillId, ({ needs_support: 0, learning: 1, basic: 2, stable: 3, undiagnosed: 4 } as const)[row.status]]));
    const targetSkillIds = new Set(tx.select({ skillId: planTargets.skillId }).from(planTargets).where(and(eq(planTargets.planId, plan.id), eq(planTargets.weekNumber, week), eq(planTargets.category, "weakness"))).all().flatMap((row) => row.skillId ? [row.skillId] : []));
    const catalogIds = new Set(phase2Catalog.map((template) => template.id));
    const candidates = tx.select({ questionInstanceId: questionInstances.id, templateId: questionTemplates.id, skillId: questionInstances.skillId, structureTag: questionTemplates.structureTag, difficulty: questionInstances.difficulty, estimatedSeconds: questionTemplates.estimatedSeconds, domain: questionTemplates.domain, lastUsedAt: questionInstances.lastUsedAt, stem: questionInstances.stem, answerSpec: questionInstances.answerSpec, explanation: questionInstances.explanation, contentTier: questionTemplates.contentTier, hintLadder: questionTemplates.hintLadder, readingCard: questionTemplates.readingCard })
      .from(questionInstances).innerJoin(questionTemplates, eq(questionInstances.templateId, questionTemplates.id)).innerJoin(skills, eq(questionTemplates.skillId, skills.id)).where(and(eq(questionInstances.active, true), eq(questionTemplates.active, true))).all()
      .filter((row) => catalogIds.has(row.templateId)).map((row) => ({
        ...row, difficulty: row.difficulty as 1 | 2 | 3 | 4,
        dueOn: dueBySkill.get(row.skillId)?.dueOn ?? null, masteryRank: ranks.get(row.skillId) ?? 4, targetDifficulty: Math.min(4, (ranks.get(row.skillId) ?? 3) + 1) as 1 | 2 | 3 | 4,
        category: dueBySkill.has(row.skillId) ? "review" as const : targetSkillIds.has(row.skillId) ? "weakness" as const : row.domain === "thinking_habits" ? "reading" as const : "extension" as const,
      }));
    const totalSlots = Math.max(15, Math.round(targetSeconds / 90));
    const composition = allocateComposition(totalSlots, (focus?.specialistFocus ?? "none") as SpecialistFocus);
    const selected = selectDailyItems({ candidates, composition, targetSeconds, date, seed: `${date}:${plan.id}:${plan.revision}` });
    const candidateByInstance = new Map(candidates.map((candidate) => [candidate.questionInstanceId, candidate]));
    const id = randomUUID(); const kind = isAssessmentDay(date, week, trainingWeekdays(focus?.trainingWeekdays)) ? "assessment" : "daily";
    tx.insert(trainingSessions).values({ id, childId, sessionDate: date, kind, ruleVersion: "phase2c-v1", targetSeconds, learningPlanId: plan.id, planRevision: plan.revision, status: "in_progress", startedAt: new Date(now).getTime(), compositionSnapshot: JSON.stringify({ snapshotVersion: 1, composition, shortages: selected.shortages, week }) }).run();
    if (selected.items.length) tx.insert(sessionItems).values(selected.items.map((item) => {
      const instance = candidateByInstance.get(item.questionInstanceId)!;
      const skill = tx.select({ name: skills.name }).from(skills).where(eq(skills.id, item.skillId)).get();
      if (!skill) throw new Error(`Missing skill ${item.skillId}`);
      return { id: randomUUID(), sessionId: id, questionTemplateId: instance.templateId, questionInstanceId: instance.questionInstanceId, position: item.position, stemSnapshot: instance.stem, answerSpecSnapshot: instance.answerSpec, explanationSnapshot: instance.explanation, skillIdSnapshot: instance.skillId, skillNameSnapshot: skill.name, difficultySnapshot: instance.difficulty, contentTierSnapshot: instance.contentTier, structureTagSnapshot: instance.structureTag, variantSeed: item.variantSeed, selectionReasonSnapshot: JSON.stringify({ selectionReason: item.selectionReason, category: item.category, estimatedSeconds: item.estimatedSeconds, dueOn: item.dueOn, reviewIntervalDays: item.category === "review" ? REVIEW_DAYS[dueBySkill.get(item.skillId)!.level] : undefined, hintLadder: JSON.parse(instance.hintLadder), readingCard: instance.readingCard }) };
    })).run();
    if (selected.items.length) tx.update(questionInstances).set({ lastUsedAt: new Date(now).getTime() }).where(inArray(questionInstances.id, selected.items.map((item) => item.questionInstanceId))).run();
    return id;
  }, { behavior: "immediate" });
  return sessionView(db, sessionId);
}
