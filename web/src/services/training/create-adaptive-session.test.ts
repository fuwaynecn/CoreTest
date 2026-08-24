import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { diagnosticRuns, learningPlans, planTargets, questionTemplates, sessionItems, skills, trainingSessions, users, reviewSchedules, masteryStates } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { DiagnosisRequiredError, getOrCreateAdaptiveSession } from "./create-adaptive-session";

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
