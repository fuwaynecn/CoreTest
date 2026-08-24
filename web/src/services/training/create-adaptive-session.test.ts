import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { diagnosticRuns, learningPlans, masteryEvidence, parentPreferences, planTargets, questionTemplates, sessionItems, skills, trainingSessions, users, reviewSchedules, masteryStates } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
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
  expect(session).toMatchObject({ kind: "daily", learningPlanId: "plan", planRevision: 2, ruleVersion: "phase2c-v1" });
  expect(items.length).toBeGreaterThan(0);
  expect(items[0]).toMatchObject({ variantSeed: expect.stringContaining("2026-08-20"), selectionReasonSnapshot: expect.stringContaining("selectionReason") });
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
