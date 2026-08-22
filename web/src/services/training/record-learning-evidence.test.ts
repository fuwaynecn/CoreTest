import { eq } from "drizzle-orm";
import { phase1DailySkills, phase1DailyTemplates } from "@/content/phase1-daily";
import type { AppDatabase } from "@/db/client";
import {
  diagnosticRuns, hintEvents, masteryEvidence, masteryStates,
  questionTemplates, sessionItems, skills, trainingSessions, users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { getOrCreateDailySession } from "./create-daily-session";
import { submitAttempt } from "./submit-attempt";
import { recordLearningEvidence } from "./record-learning-evidence";

function seedTrainingDatabaseForEvidence(db: AppDatabase) {
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values(phase1DailySkills.map((skill) => ({ ...skill }))).run();
  db.insert(questionTemplates).values(phase1DailyTemplates.map((template) => ({
    ...template, variantSpec: "{}", commonErrors: JSON.stringify(template.commonErrors),
    hintLadder: JSON.stringify(template.hintLadder), answerSpec: JSON.stringify(template.answerSpec), active: true,
  }))).run();
  db.insert(diagnosticRuns).values({
    id: "completed-diagnosis", childId: "child-1", version: 1, status: "completed",
    currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2, reportSnapshot: "{}",
  }).run();
  return db;
}

test("a wrong first submission appends one immutable evidence row and correction does not rewrite it", () => {
  const db = seedTrainingDatabaseForEvidence(createTestDatabase());
  const session = getOrCreateDailySession(db, "child-1", "2026-08-20");
  const itemId = session.questions[0].id;

  submitAttempt(db, { childId: "child-1", sessionItemId: itemId,
    clientSubmissionId: "41414141-4141-4141-8141-414141414141", answerText: "0" });
  submitAttempt(db, { childId: "child-1", sessionItemId: itemId,
    clientSubmissionId: "42424242-4242-4242-8242-424242424242", answerText: "6" });

  expect(db.select().from(masteryEvidence).where(eq(masteryEvidence.sessionItemId, itemId)).all())
    .toEqual([expect.objectContaining({
      templateId: "q-decimal-1", firstAttemptCorrect: false, independent: true,
      hintLevel: 0, dosageTrack: "computation", purpose: "learning", occurredOn: shanghaiDateKey(),
      diagnosticRunId: null, diagnosticCompletedAt: null,
    })]);
  expect(db.select().from(masteryStates).where(eq(masteryStates.skillId, "skill-decimal")).get())
    .toMatchObject({ evidenceCount: 1, correctCount: 0, evidenceVersion: 1 });
});

test("persisted hints make first-attempt evidence non-independent", () => {
  const db = seedTrainingDatabaseForEvidence(createTestDatabase());
  const session = getOrCreateDailySession(db, "child-1", "2026-08-20");
  const itemId = session.questions[0].id;
  db.insert(hintEvents).values({
    id: "hint-1", childId: "child-1", sessionItemId: itemId, hintLevel: 1, revealedAt: 1,
  }).run();

  submitAttempt(db, { childId: "child-1", sessionItemId: itemId,
    clientSubmissionId: "43434343-4343-4343-8343-434343434343", answerText: "6" });
  expect(db.select().from(masteryEvidence).where(eq(masteryEvidence.sessionItemId, itemId)).get())
    .toMatchObject({ firstAttemptCorrect: true, independent: false, hintLevel: 1 });
});

test("evidence keeps the immutable item template snapshot after catalog edits", () => {
  const db = seedTrainingDatabaseForEvidence(createTestDatabase());
  const session = getOrCreateDailySession(db, "child-1", "2026-08-20");
  const itemId = session.questions[0].id;
  db.update(questionTemplates).set({ structureTag: "edited", difficulty: 4 })
    .where(eq(questionTemplates.id, "q-decimal-1")).run();

  submitAttempt(db, { childId: "child-1", sessionItemId: itemId,
    clientSubmissionId: "44434343-4343-4343-8343-434343434343", answerText: "6" });
  expect(db.select().from(masteryEvidence).where(eq(masteryEvidence.sessionItemId, itemId)).get())
    .toMatchObject({ templateId: "q-decimal-1", structureTag: "decimal-add", difficulty: 1 });
});

test("non-scoring practice attempts do not create formal mastery evidence", () => {
  const db = seedTrainingDatabaseForEvidence(createTestDatabase());
  db.insert(trainingSessions).values({
    id: "practice", childId: "child-1", sessionDate: "2026-08-20",
    kind: "practice", status: "in_progress", startedAt: 1,
  }).run();
  db.insert(sessionItems).values({
    id: "practice-item", sessionId: "practice", questionTemplateId: "q-decimal-1", position: 0,
    stemSnapshot: "3.6 + 2.4 = ?", answerSpecSnapshot: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
    explanationSnapshot: "对齐十分位。", skillIdSnapshot: "skill-decimal", skillNameSnapshot: "小数计算",
    difficultySnapshot: 1, structureTagSnapshot: "decimal-add", selectionReasonSnapshot: "{}",
  }).run();
  submitAttempt(db, { childId: "child-1", sessionItemId: "practice-item",
    clientSubmissionId: "45454545-4545-4545-8545-454545454545", answerText: "6" });
  expect(db.select().from(masteryEvidence).all()).toHaveLength(0);
  expect(db.select().from(masteryStates).all()).toHaveLength(0);
});

test("new evidence does not erase a preserved legacy status when diagnostic telemetry is unknown", () => {
  const db = seedTrainingDatabaseForEvidence(createTestDatabase());
  db.insert(masteryStates).values({
    childId: "child-1", skillId: "skill-decimal", status: "basic",
    evidenceCount: 2, correctCount: 2, reasonCode: "legacy_snapshot", evidenceVersion: 0, updatedAt: 1,
  }).run();
  const itemId = getOrCreateDailySession(db, "child-1", "2026-08-20").questions[0].id;
  submitAttempt(db, { childId: "child-1", sessionItemId: itemId,
    clientSubmissionId: "46464646-4646-4646-8646-464646464646", answerText: "6" });
  expect(db.select().from(masteryStates).where(eq(masteryStates.skillId, "skill-decimal")).get())
    .toMatchObject({ status: "basic", evidenceCount: 1, correctCount: 1 });
});

test("cache cursor and time follow the reducer timeline across a long retest", () => {
  const db = seedTrainingDatabaseForEvidence(createTestDatabase());
  db.update(diagnosticRuns).set({ completedAt: 150 })
    .where(eq(diagnosticRuns.id, "completed-diagnosis")).run();
  db.insert(diagnosticRuns).values({
    id: "retest", childId: "child-1", version: 2, status: "completed", currentPart: 3,
    seed: "retest", startedAt: 100, completedAt: 400, reportSnapshot: "{}",
  }).run();
  db.insert(trainingSessions).values([
    { id: "diagnostic-1", childId: "child-1", sessionDate: "2026-08-20", kind: "diagnostic",
      diagnosticRunId: "completed-diagnosis", diagnosticPartNumber: 1, status: "completed", startedAt: 1, completedAt: 150 },
    { id: "daily-between", childId: "child-1", sessionDate: "2026-08-27", kind: "daily",
      status: "completed", startedAt: 200, completedAt: 300 },
    { id: "diagnostic-2", childId: "child-1", sessionDate: "2026-08-21", kind: "diagnostic",
      diagnosticRunId: "retest", diagnosticPartNumber: 1, status: "completed", startedAt: 100, completedAt: 400 },
    { id: "daily-after", childId: "child-1", sessionDate: "2026-09-02", kind: "daily",
      status: "completed", startedAt: 450, completedAt: 500 },
  ]).run();
  db.insert(sessionItems).values([
    { id: "diagnostic-item-1", sessionId: "diagnostic-1", questionTemplateId: "q-decimal-1", position: 0,
      stemSnapshot: "1", answerSpecSnapshot: "{}", explanationSnapshot: "1", skillIdSnapshot: "skill-decimal", skillNameSnapshot: "小数计算" },
    { id: "daily-item-between", sessionId: "daily-between", questionTemplateId: "q-decimal-1", position: 0,
      stemSnapshot: "1", answerSpecSnapshot: "{}", explanationSnapshot: "1", skillIdSnapshot: "skill-decimal", skillNameSnapshot: "小数计算" },
    { id: "diagnostic-item-2", sessionId: "diagnostic-2", questionTemplateId: "q-decimal-1", position: 0,
      stemSnapshot: "1", answerSpecSnapshot: "{}", explanationSnapshot: "1", skillIdSnapshot: "skill-decimal", skillNameSnapshot: "小数计算" },
    { id: "daily-item-after", sessionId: "daily-after", questionTemplateId: "q-decimal-1", position: 0,
      stemSnapshot: "1", answerSpecSnapshot: "{}", explanationSnapshot: "1", skillIdSnapshot: "skill-decimal", skillNameSnapshot: "小数计算" },
  ]).run();
  const base = {
    childId: "child-1", skillId: "skill-decimal", templateId: "q-decimal-1",
    firstAttemptCorrect: true, independent: true, hintLevel: 0 as const,
    dosageTrack: "computation" as const,
    difficulty: 1 as const, structureTag: "decimal-add", reviewIntervalDays: 0 as const,
  };
  recordLearningEvidence(db, { ...base, sessionItemId: "diagnostic-item-1", purpose: "diagnostic",
    occurredOn: "2026-08-20", occurredAt: 100, diagnosticRunId: "completed-diagnosis",
    diagnosticCompletedOn: "2026-08-20", diagnosticCompletedAt: 150 });
  recordLearningEvidence(db, { ...base, sessionItemId: "daily-item-between", purpose: "learning",
    occurredOn: "2026-08-27", occurredAt: 300,
    diagnosticRunId: null, diagnosticCompletedOn: null, diagnosticCompletedAt: null });
  recordLearningEvidence(db, { ...base, sessionItemId: "diagnostic-item-2", purpose: "diagnostic",
    occurredOn: "2026-08-21", occurredAt: 200, diagnosticRunId: "retest",
    diagnosticCompletedOn: "2026-09-01", diagnosticCompletedAt: 400 });
  const retestEvidence = db.select().from(masteryEvidence)
    .where(eq(masteryEvidence.sessionItemId, "diagnostic-item-2")).get()!;
  expect(db.select().from(masteryStates).where(eq(masteryStates.skillId, "skill-decimal")).get())
    .toMatchObject({ updatedAt: 400, evidenceCursor: retestEvidence.id, evidenceVersion: 3, evidenceCount: 3 });

  recordLearningEvidence(db, { ...base, sessionItemId: "daily-item-after", purpose: "learning",
    occurredOn: "2026-09-02", occurredAt: 500,
    diagnosticRunId: null, diagnosticCompletedOn: null, diagnosticCompletedAt: null });
  const laterEvidence = db.select().from(masteryEvidence)
    .where(eq(masteryEvidence.sessionItemId, "daily-item-after")).get()!;
  expect(db.select().from(masteryStates).where(eq(masteryStates.skillId, "skill-decimal")).get())
    .toMatchObject({ updatedAt: 500, evidenceCursor: laterEvidence.id, evidenceVersion: 4, evidenceCount: 4 });
});
