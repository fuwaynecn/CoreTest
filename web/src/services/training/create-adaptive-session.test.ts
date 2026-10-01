import { eq } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { diagnosticRuns, learningPlans, masteryEvidence, parentPreferences, planTargets, questionBankRefreshes, questionInstances, questionTemplates, sessionItems, skills, trainingSessions, users, reviewSchedules, masteryStates, childSkillSettings } from "@/db/schema";
import * as questionBank from "@/services/questions/question-bank-refresh";
import { shanghaiWeekKey } from "@/domain/time/shanghai-calendar";
import { createTestDatabase } from "@/test/test-db";
import { getPlanDashboard } from "@/services/parent/get-plan-dashboard";
import { ActivePlanRequiredError, DiagnosisRequiredError, getOrCreateAdaptiveSession } from "./create-adaptive-session";
import { submitAttempt } from "./submit-attempt";

function seed() {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values(phase2Skills).run();
  db.insert(questionTemplates).values(phase2Catalog.map((template) => ({
    id: template.id, skillId: `skill-${template.skillCode}`, domain: template.domain, contentTier: template.contentTier,
    structureTag: template.structureTag, estimatedSeconds: template.estimatedSeconds, readingLoad: template.readingLoad,
    answerMode: template.answerMode, variantSpec: JSON.stringify(template.variantSpec), hintLadder: JSON.stringify(template.hintLadder),
    commonErrors: JSON.stringify(template.commonErrors), readingCard: template.readingCard, source: template.source, licenseStatus: template.licenseStatus,
    stem: template.stemPattern, answerSpec: JSON.stringify(template.answerSpecPattern), explanation: template.explanationPattern, difficulty: template.difficulty, active: true,
  }))).run();
  return db;
}

test("requires a completed diagnosis before adaptive scheduling", () => {
  const db = seed();
  expect(() => getOrCreateAdaptiveSession(db, "child", "2026-08-20", new Date("2026-08-20T01:00:00Z"))).toThrow(DiagnosisRequiredError);
});

test("creates immutable same-day adaptive snapshots from the active plan", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "diagnosis-seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 2, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(planTargets).values({ planId: "plan", weekNumber: 1, targetKey: "weakness:skill-decimal", skillId: "skill-decimal", track: null, category: "weakness", minimum: 1, target: 2, maximum: 3, reasonCode: "mastery_needs_support" }).run();
  db.insert(masteryStates).values({ childId: "child", skillId: "skill-decimal", status: "needs_support", evidenceCount: 0, correctCount: 0, reasonCode: "test", updatedAt: 1 }).run();
  db.insert(reviewSchedules).values({ childId: "child", skillId: "skill-decimal", level: 1, dueOn: "2026-08-19", lastResult: null, updatedAt: 1 }).run();

  const first = getOrCreateAdaptiveSession(db, "child", "2026-08-20", new Date("2026-08-20T01:00:00Z"));
  const again = getOrCreateAdaptiveSession(db, "child", "2026-08-20", new Date("2026-08-20T02:00:00Z"));
  const session = db.select().from(trainingSessions).where(eq(trainingSessions.id, first.id)).get()!;
  const items = db.select().from(sessionItems).where(eq(sessionItems.sessionId, first.id)).all();
  expect(again.id).toBe(first.id);
  expect(session).toMatchObject({ kind: "daily", learningPlanId: "plan", planRevision: 2, ruleVersion: "phase2c-v2" });
  expect(items).toHaveLength(20);
  expect(items[0]).toMatchObject({ variantSeed: expect.stringContaining("2026-08-20"), selectionReasonSnapshot: expect.stringContaining("selectionReason") });
});

test("keeps a short configured session at a fifteen-question minimum", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "diagnosis-seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,5]", targetMinutes: 20, specialistFocus: "none", updatedAt: 1 }).run();

  const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20");

  expect(session.questions).toHaveLength(15);
});

test("classifies due daily items as review evidence with their frozen interval", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(reviewSchedules).values({ childId: "child", skillId: "skill-decimal", level: 1, dueOn: "2026-08-19", lastResult: null, updatedAt: 1 }).run();
  const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20");
  const item = db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all()
    .find((row) => JSON.parse(row.selectionReasonSnapshot).category === "review")!;
  const answer = JSON.parse(item.answerSpecSnapshot).value;
  submitAttempt(db, { childId: "child", sessionItemId: item.id, clientSubmissionId: "33333333-3333-4333-8333-333333333333", answerText: String(answer) });
  expect(db.select().from(masteryEvidence).where(eq(masteryEvidence.sessionItemId, item.id)).get())
    .toMatchObject({ purpose: "review", reviewIntervalDays: 3 });
});

test("creates due reviews from persistent question instances and marks them used", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(reviewSchedules).values({ childId: "child", skillId: "skill-equation-l1", level: 1, dueOn: "2026-08-19", lastResult: null, updatedAt: 1 }).run();

  const usedAt = 1_725_000_000_000;
  const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20", usedAt);
  expect(session.questions).toContainEqual(expect.objectContaining({ stem: expect.stringContaining("方程") }));
  const item = db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all()
    .find((row) => JSON.parse(row.selectionReasonSnapshot).category === "review")!;
  const instance = db.select().from(questionInstances).where(eq(questionInstances.id, item.questionInstanceId!)).get()!;
  expect(item).toMatchObject({ questionTemplateId: instance.templateId, questionInstanceId: instance.id, stemSnapshot: instance.stem, answerSpecSnapshot: instance.answerSpec, explanationSnapshot: instance.explanation, difficultySnapshot: instance.difficulty });
  expect(item.questionInstanceId).not.toBeNull();
  expect(instance.lastUsedAt).toBe(usedAt);
});

test("scoped refresh replenishes a missing due skill even when the weekly ledger exists", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(reviewSchedules).values({ childId: "child", skillId: "skill-equation-l1", level: 1, dueOn: "2026-08-19", lastResult: null, updatedAt: 1 }).run();
  db.insert(questionBankRefreshes).values({ weekKey: shanghaiWeekKey(new Date("2026-08-20T12:00:00+08:00")), completedAt: 1, generatedCount: 0, errors: "[]" }).run();

  getOrCreateAdaptiveSession(db, "child", "2026-08-20");
  expect(db.select().from(questionInstances).where(eq(questionInstances.skillId, "skill-equation-l1")).all().length).toBeGreaterThan(0);
});

test("does not reuse a concrete question within seven days while fresh supply lasts", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,5]", targetMinutes: 20, specialistFocus: "none", updatedAt: 1 }).run();
  const now = Date.parse("2026-08-20T12:00:00+08:00");
  const structureTags = ["eq-l1-balance-01", "eq-l1-balance-02", "eq-l1-balance-03"];
  db.insert(questionInstances).values([
    ...structureTags.flatMap((templateId, tagIndex) => Array.from({ length: 6 }, (_, index) => ({
      id: `fresh-${tagIndex}-${index}`, templateId, skillId: "skill-equation-l1", variantSeed: `fresh-${tagIndex}-${index}`, variables: "{}",
      stem: `尚未使用 ${tagIndex}-${index}`, answerSpec: JSON.stringify({ kind: "equation", value: "4" }), explanation: "未用",
      difficulty: 1, fingerprint: `fresh-fingerprint-${tagIndex}-${index}`, active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null,
    }))),
    { id: "recent-instance", templateId: structureTags[0], skillId: "skill-equation-l1", variantSeed: "recent", variables: "{}", stem: "近期用过", answerSpec: JSON.stringify({ kind: "equation", value: "3" }), explanation: "近期", difficulty: 1, fingerprint: "recent-fingerprint", active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: Date.parse("2026-08-18T12:00:00+08:00") },
  ]).run();
  const refresh = vi.spyOn(questionBank, "ensureQuestionBankFresh").mockReturnValue({ skipped: true, generated: 0, errors: [] });

  try {
    const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20", now);
    const instanceIds = db.select({ id: sessionItems.questionInstanceId }).from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all().map((row) => row.id);
    expect(instanceIds).toHaveLength(15);
    expect(instanceIds).not.toContain("recent-instance");
  } finally {
    refresh.mockRestore();
  }
});

test("reuses recently used questions instead of scheduling an empty session", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,5]", targetMinutes: 20, specialistFocus: "none", updatedAt: 1 }).run();
  const now = Date.parse("2026-08-20T12:00:00+08:00");
  const recentlyUsed = now - 86_400_000;
  const structureTags = ["eq-l1-balance-01", "eq-l1-balance-02", "eq-l1-balance-03"];
  db.insert(questionInstances).values(structureTags.flatMap((templateId, tagIndex) => Array.from({ length: 5 }, (_, index) => ({
    id: `recent-${tagIndex}-${index}`, templateId, skillId: "skill-equation-l1", variantSeed: `recent-${tagIndex}-${index}`, variables: "{}",
    stem: `近期用过 ${tagIndex}-${index}`, answerSpec: JSON.stringify({ kind: "equation", value: "3" }), explanation: "近期",
    difficulty: 1, fingerprint: `recent-fingerprint-${tagIndex}-${index}`, active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: recentlyUsed,
  })))).run();
  const refresh = vi.spyOn(questionBank, "ensureQuestionBankFresh").mockReturnValue({ skipped: true, generated: 0, errors: [] });

  try {
    const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20", now);
    expect(session.questions).toHaveLength(15);
    expect(new Set(session.questions.map((item) => item.id)).size).toBe(15);
  } finally {
    refresh.mockRestore();
  }
});

test("replenishes consumed planned-skill inventory after the weekly refresh", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(planTargets).values({ planId: "plan", weekNumber: 1, targetKey: "weakness:skill-equation-l1", skillId: "skill-equation-l1", track: null, category: "weakness", minimum: 1, target: 2, maximum: 3, reasonCode: "mastery_needs_support" }).run();
  db.insert(questionBankRefreshes).values({ weekKey: shanghaiWeekKey(new Date("2026-08-20T12:00:00+08:00")), completedAt: 1, generatedCount: 0, errors: "[]" }).run();
  const template = phase2Catalog.find((row) => row.id === "eq-l1-balance-01")!;
  const recentlyUsed = Date.parse("2026-08-19T12:00:00+08:00");
  db.insert(questionInstances).values(Array.from({ length: 8 }, (_, index) => ({
    id: `consumed-${index}`, templateId: template.id, skillId: "skill-equation-l1", variantSeed: `consumed-${index}`, variables: "{}", stem: `已使用 ${index}`, answerSpec: JSON.stringify({ kind: "equation", value: String(index) }), explanation: "已使用", difficulty: template.difficulty, fingerprint: `consumed-fingerprint-${index}`, active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: recentlyUsed,
  }))).run();

  getOrCreateAdaptiveSession(db, "child", "2026-08-20", Date.parse("2026-08-20T12:00:00+08:00"));

  expect(db.select().from(questionInstances).where(eq(questionInstances.skillId, "skill-equation-l1")).all().length).toBeGreaterThan(8);
});

test("falls back to existing active instances when bank refresh fails", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  const template = phase2Catalog.find((row) => row.id === "eq-l1-balance-01")!;
  db.insert(questionInstances).values({ id: "existing-instance", templateId: template.id, skillId: "skill-equation-l1", variantSeed: "existing", variables: "{}", stem: "方程复习题", answerSpec: JSON.stringify({ kind: "equation", value: "3" }), explanation: "已有题目", difficulty: template.difficulty, fingerprint: "existing-fingerprint", active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null }).run();
  const refresh = vi.spyOn(questionBank, "ensureQuestionBankFresh").mockImplementation(() => { throw new Error("refresh unavailable"); });
  try {
    const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20");
    const item = db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all().find((row) => row.questionInstanceId === "existing-instance");
    expect(item).toMatchObject({ questionInstanceId: "existing-instance", stemSnapshot: "方程复习题" });
  } finally {
    refresh.mockRestore();
  }
});

test("uses the instance skill domain for scheduling while retaining template provenance", () => {
  const db = seed();
  const sourceTemplate = phase2Catalog.find((template) => template.id === "num-int-mental-01")!;
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2 }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(questionInstances).values({
    id: "moved-instance", templateId: sourceTemplate.id, skillId: "skill-read-question", variantSeed: "moved", variables: "{}",
    stem: "口算：3 + 4 = ？", answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanation: "7",
    difficulty: sourceTemplate.difficulty, fingerprint: "moved-fingerprint", active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null,
  }).run();
  const refresh = vi.spyOn(questionBank, "ensureQuestionBankFresh").mockReturnValue({ skipped: true, generated: 0, errors: [] });

  try {
    const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20", 2);
    const item = db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).get()!;
    expect(JSON.parse(item.selectionReasonSnapshot)).toMatchObject({ category: "reading" });
    expect(item).toMatchObject({ questionInstanceId: "moved-instance", questionTemplateId: sourceTemplate.id, skillIdSnapshot: "skill-read-question" });
  } finally {
    refresh.mockRestore();
  }
});

test("uses the instance skill domain in the parent dashboard preview", () => {
  const db = seed();
  const sourceTemplate = phase2Catalog.find((template) => template.id === "num-int-mental-01")!;
  db.insert(questionInstances).values({
    id: "moved-preview-instance", templateId: sourceTemplate.id, skillId: "skill-read-question", variantSeed: "moved-preview", variables: "{}",
    stem: "口算：3 + 4 = ？", answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanation: "7",
    difficulty: sourceTemplate.difficulty, fingerprint: "moved-preview-fingerprint", active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null,
  }).run();

  const preview = getPlanDashboard(db, "child", new Date("2026-08-24T04:00:00Z")).nextSevenDays[0].items;
  expect(preview).toEqual(expect.arrayContaining([{ category: "reading", reason: "reading" }]));
});

test("does not let an existing daily session bypass the diagnosis gate", () => {
  const db = seed();
  db.insert(trainingSessions).values({ id: "old", childId: "child", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 }).run();
  expect(() => getOrCreateAdaptiveSession(db, "child", "2026-08-20")).toThrow(DiagnosisRequiredError);
});

test("does not let an existing daily session bypass the active-plan gate", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(trainingSessions).values({ id: "old", childId: "child", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 }).run();
  expect(() => getOrCreateAdaptiveSession(db, "child", "2026-08-20")).toThrow(ActivePlanRequiredError);
});

test("uses the last configured Shanghai training day for the week-four assessment", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4]", targetMinutes: 20, specialistFocus: "none", updatedAt: 1 }).run();
  const session = getOrCreateAdaptiveSession(db, "child", "2026-09-10");
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, session.id)).get()?.kind).toBe("assessment");
});

test("keeps a due review as review evidence on the week-four assessment day", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(reviewSchedules).values({ childId: "child", skillId: "skill-decimal", level: 1, dueOn: "2026-09-10", lastResult: null, updatedAt: 1 }).run();
  const session = getOrCreateAdaptiveSession(db, "child", "2026-09-11");
  const item = db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all()
    .find((row) => JSON.parse(row.selectionReasonSnapshot).category === "review")!;
  submitAttempt(db, { childId: "child", sessionItemId: item.id, clientSubmissionId: "44444444-4444-4444-8444-444444444444", answerText: String(JSON.parse(item.answerSpecSnapshot).value) });
  expect(db.select().from(masteryEvidence).where(eq(masteryEvidence.sessionItemId, item.id)).get())
    .toMatchObject({ purpose: "review", reviewIntervalDays: 3 });
});

test("treats Sunday as the final configured Shanghai training day", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,5,0]", targetMinutes: 20, specialistFocus: "none", updatedAt: 1 }).run();
  const session = getOrCreateAdaptiveSession(db, "child", "2026-09-13");
  expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, session.id)).get()?.kind).toBe("assessment");
});

test("excludes disabled (off) skills from daily session items", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,5]", targetMinutes: 20, specialistFocus: "none", updatedAt: 1 }).run();

  // Insert instances for two distinct skills
  const equationTemplates = ["eq-l1-balance-01", "eq-l1-balance-02", "eq-l1-balance-03"];
  db.insert(questionInstances).values(equationTemplates.flatMap((templateId, tagIndex) => Array.from({ length: 5 }, (_, index) => ({
    id: `eq-instance-${tagIndex}-${index}`, templateId, skillId: "skill-equation-l1", variantSeed: `eq-${tagIndex}-${index}`, variables: "{}",
    stem: `方程题 ${tagIndex}-${index}`, answerSpec: JSON.stringify({ kind: "equation", value: "4" }), explanation: "方程解析",
    difficulty: 1, fingerprint: `eq-fp-${tagIndex}-${index}`, active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null,
  })))).run();

  const mentalTemplates = ["num-int-mental-01"];
  db.insert(questionInstances).values(mentalTemplates.flatMap((templateId, tagIndex) => Array.from({ length: 10 }, (_, index) => ({
    id: `mental-instance-${tagIndex}-${index}`, templateId, skillId: "skill-integer-mental", variantSeed: `mental-${tagIndex}-${index}`, variables: "{}",
    stem: `口算题 ${tagIndex}-${index}`, answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanation: "口算解析",
    difficulty: 1, fingerprint: `mental-fp-${tagIndex}-${index}`, active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null,
  })))).run();

  // Disable equation skill
  db.insert(childSkillSettings).values({ childId: "child", skillId: "skill-equation-l1", mode: "off", updatedAt: 1 }).run();

  const refresh = vi.spyOn(questionBank, "ensureQuestionBankFresh").mockReturnValue({ skipped: true, generated: 0, errors: [] });
  try {
    const session = getOrCreateAdaptiveSession(db, "child", "2026-08-20");
    const items = db.select({ skillId: sessionItems.skillIdSnapshot }).from(sessionItems).where(eq(sessionItems.sessionId, session.id)).all();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.skillId !== "skill-equation-l1")).toBe(true);
  } finally {
    refresh.mockRestore();
  }
});

test("removes disabled skills from scheduling target set (no force-refresh for off skill)", () => {
  const db = seed();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}" }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 1, status: "active", startsOn: "2026-08-17", endsOn: "2026-09-27", reasonSnapshot: "{}", createdAt: 1 }).run();

  // Only one due skill: equation-l1, and it's disabled
  db.insert(reviewSchedules).values({ childId: "child", skillId: "skill-equation-l1", level: 1, dueOn: "2026-08-19", lastResult: null, updatedAt: 1 }).run();
  db.insert(planTargets).values({ planId: "plan", weekNumber: 1, targetKey: "weakness:skill-equation-l1", skillId: "skill-equation-l1", track: null, category: "weakness", minimum: 1, target: 2, maximum: 3, reasonCode: "mastery_needs_support" }).run();
  db.insert(masteryStates).values({ childId: "child", skillId: "skill-equation-l1", status: "needs_support", evidenceCount: 0, correctCount: 0, reasonCode: "test", updatedAt: 1 }).run();

  // Disable the targeted skill
  db.insert(childSkillSettings).values({ childId: "child", skillId: "skill-equation-l1", mode: "off", updatedAt: 1 }).run();

  // Pre-existing weekly refresh entry (so general refresh skips)
  db.insert(questionBankRefreshes).values({ weekKey: shanghaiWeekKey(new Date("2026-08-20T12:00:00+08:00")), completedAt: 1, generatedCount: 0, errors: "[]" }).run();

  const refreshCalls: Array<{ skillIds?: readonly string[]; force?: boolean }> = [];
  const refresh = vi.spyOn(questionBank, "ensureQuestionBankFresh").mockImplementation((_db, _date, opts) => {
    refreshCalls.push({ skillIds: opts?.skillIds, force: opts?.force });
    return { skipped: true, generated: 0, errors: [] };
  });

  try {
    getOrCreateAdaptiveSession(db, "child", "2026-08-20");
    // The scoped force-refresh call should NOT include the off skill
    const forceCall = refreshCalls.find((call) => call.force === true);
    if (forceCall) {
      expect(forceCall.skillIds).not.toContain("skill-equation-l1");
    }
    // If the only targeted skill is off, no force refresh at all
    const hasForceRefresh = refreshCalls.some((call) => call.force === true);
    expect(hasForceRefresh).toBe(false);
  } finally {
    refresh.mockRestore();
  }
});
