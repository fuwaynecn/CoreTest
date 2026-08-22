import {
  attempts,
  diagnosticRuns,
  dosageStates,
  errorObservations,
  masteryEvidence,
  masteryStates,
  questionTemplates,
  reviewSchedules,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "@/test/test-db";
import { updateLearningState } from "@/services/training/update-learning-state";
import { getLearningState } from "./get-learning-state";

const NOW = Date.parse("2026-08-23T10:00:00+08:00");

function seedLearningState() {
  const db = createTestDatabase();
  db.insert(users).values([
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 },
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
  ]).run();
  db.insert(skills).values([
    { id: "skill-equation", code: "equation-two-step", name: "两步方程", domain: "equation_algebra" },
    { id: "skill-reading", code: "reading-unit", name: "读题与单位", domain: "thinking_habits" },
    { id: "skill-computation", code: "decimal-computation", name: "小数计算", domain: "number_operations" },
    { id: "skill-unseen", code: "geometry-unseen", name: "图形观察", domain: "geometry_space" },
  ]).run();
  db.insert(questionTemplates).values([
    { id: "tpl-equation", skillId: "skill-equation", domain: "equation_algebra", structureTag: "equation-two-step", stem: "3x+5=26，x是多少？", answerSpec: "{}", explanation: "先减后除", difficulty: 4 },
    { id: "tpl-reading", skillId: "skill-reading", domain: "thinking_habits", structureTag: "word-unit", stem: "每盒彩笔7.5元，买1盒多少钱？请写单位。", answerSpec: "{}", explanation: "写单位", difficulty: 2 },
    { id: "tpl-computation", skillId: "skill-computation", domain: "number_operations", structureTag: "decimal-add", stem: "3.6+2.4=?", answerSpec: "{}", explanation: "小数加法", difficulty: 2 },
  ]).run();

  const items = Array.from({ length: 7 }, (_, index) => {
    const reading = index === 5;
    const computation = index === 6;
    const skillId = reading ? "skill-reading" : computation ? "skill-computation" : "skill-equation";
    const templateId = reading ? "tpl-reading" : computation ? "tpl-computation" : "tpl-equation";
    return {
      id: `item-${index + 1}`,
      sessionId: `session-${index + 1}`,
      questionTemplateId: templateId,
      position: 1,
      stemSnapshot: reading ? "每盒彩笔7.5元，买1盒多少钱？请写单位。" : computation ? "3.6+2.4=?" : "3x+5=26，x是多少？",
      answerSpecSnapshot: "{}",
      explanationSnapshot: "讲解",
      skillIdSnapshot: skillId,
      skillNameSnapshot: reading ? "读题与单位" : computation ? "小数计算" : "两步方程",
      difficultySnapshot: reading || computation ? 2 : 4,
      structureTagSnapshot: reading ? "word-unit" : computation ? "decimal-add" : "equation-two-step",
    };
  });
  db.insert(trainingSessions).values(items.map((item, index) => ({
    id: item.sessionId,
    childId: "child-1",
    sessionDate: `2026-08-${String(17 + index).padStart(2, "0")}`,
    kind: index === 4 ? "review" as const : "daily" as const,
    status: "completed" as const,
    startedAt: NOW - (7 - index) * 86_400_000,
    completedAt: NOW - (7 - index) * 86_400_000 + 1_000,
  }))).run();
  db.insert(sessionItems).values(items).run();

  db.insert(attempts).values(items.map((item, index) => ({
    id: index === 5 ? "z-attempt-reading-first" : `attempt-${index + 1}`,
    sessionItemId: item.id,
    clientSubmissionId: `submission-${index + 1}`,
    answerText: index === 5 ? "7.5" : index === 6 ? "6" : index === 4 ? "6" : "7",
    isCorrect: index !== 4 && index !== 5,
    normalizedAnswer: index === 5 ? "7.5" : index === 6 ? "6" : index === 4 ? "6" : "7",
    explanation: "讲解",
    sessionCompleted: true,
    activeDurationMs: 45_000 + index * 1_000,
    hintLevel: 0,
    hintCount: 0,
    correctionNumber: 0,
    submittedAt: index === 5 ? NOW - 86_400_000 + 1_500 : NOW - (7 - index) * 86_400_000 + 500,
  }))).run();
  db.insert(attempts).values({
    id: "a-attempt-reading-corrected",
    sessionItemId: "item-6",
    clientSubmissionId: "submission-reading-corrected",
    answerText: "7.5元",
    isCorrect: true,
    normalizedAnswer: "7.5 元",
    explanation: "讲解",
    sessionCompleted: true,
    activeDurationMs: 18_000,
    hintLevel: 0,
    hintCount: 0,
    correctionNumber: 1,
    submittedAt: NOW - 86_400_000 + 1_500,
  }).run();

  db.insert(masteryEvidence).values(items.map((item, index) => ({
    id: `evidence-${index + 1}`,
    childId: "child-1",
    skillId: item.skillIdSnapshot,
    sessionItemId: item.id,
    templateId: item.questionTemplateId,
    purpose: index === 4 ? "review" as const : "learning" as const,
    firstAttemptCorrect: index !== 4 && index !== 5,
    independent: index !== 4 && index !== 5,
    hintLevel: 0,
    dosageTrack: item.skillIdSnapshot === "skill-equation"
      ? "equation" as const
      : item.skillIdSnapshot === "skill-computation" ? "computation" as const : null,
    difficulty: item.difficultySnapshot,
    structureTag: item.structureTagSnapshot,
    occurredOn: `2026-08-${String(17 + index).padStart(2, "0")}`,
    occurredAt: NOW - (7 - index) * 86_400_000 + 500,
    reviewIntervalDays: index === 4 ? 3 as const : 0 as const,
  }))).run();
  db.insert(masteryStates).values([
    { childId: "child-1", skillId: "skill-equation", status: "learning", evidenceCount: 5, correctCount: 4, reasonCode: "recent_five_below_basic", evidenceCursor: "evidence-5", evidenceVersion: 5, updatedAt: NOW - 2 * 86_400_000 },
    { childId: "child-1", skillId: "skill-reading", status: "needs_support", evidenceCount: 1, correctCount: 0, reasonCode: "diagnostic_needs_support", evidenceCursor: "evidence-6", evidenceVersion: 1, updatedAt: NOW - 86_400_000 },
    { childId: "child-1", skillId: "skill-computation", status: "basic", evidenceCount: 1, correctCount: 1, reasonCode: "diagnostic_basic", evidenceCursor: "evidence-7", evidenceVersion: 1, updatedAt: NOW },
    { childId: "child-1", skillId: "skill-unseen", status: "basic", evidenceCount: 12, correctCount: 9, reasonCode: "legacy_snapshot", evidenceCursor: null, evidenceVersion: 0, updatedAt: NOW },
  ]).run();
  db.insert(reviewSchedules).values({
    childId: "child-1", skillId: "skill-equation", level: 0,
    dueOn: "2026-08-23", lastResult: "incorrect",
    updatedAt: NOW - 3 * 86_400_000 + 500,
  }).run();
  db.insert(dosageStates).values([
    { childId: "child-1", track: "equation", level: 4, weeklyTarget: 18, sessionMinimum: 4, sessionTarget: 5, sessionMaximum: 6, reasonJson: JSON.stringify({ reasonCode: "hold", sameStructureCap: 6, parentInterventionSuggested: false }), updatedAt: NOW },
    { childId: "child-1", track: "computation", level: 3, weeklyTarget: 72, sessionMinimum: 12, sessionTarget: 15, sessionMaximum: 19, reasonJson: JSON.stringify({ reasonCode: "support", sameStructureCap: 6, parentInterventionSuggested: true }), updatedAt: NOW },
  ]).run();

  db.insert(errorObservations).values([
    { id: "error-knowledge", childId: "child-1", sessionItemId: "item-5", attemptId: "attempt-5", source: "system", systemCandidate: "relationship", observedAt: NOW - 2_000, createdAt: NOW - 2_000 },
    { id: "error-habit-1", childId: "child-1", sessionItemId: "item-6", attemptId: "z-attempt-reading-first", source: "system", systemCandidate: "missing_unit", observedAt: NOW - 1_800, createdAt: NOW - 1_800 },
    { id: "error-habit-1-child", childId: "child-1", sessionItemId: "item-6", attemptId: "z-attempt-reading-first", source: "child", childSelfReport: "missed_condition_or_unit", previousValue: "missing_unit", previousObservationId: "error-habit-1", actorId: "child-1", observedAt: NOW - 1_700, createdAt: NOW - 1_700 },
    { id: "error-habit-2", childId: "child-1", sessionItemId: "item-1", attemptId: "attempt-1", source: "system", systemCandidate: "relationship", observedAt: NOW - 1_600, createdAt: NOW - 1_600 },
    { id: "error-habit-2-child", childId: "child-1", sessionItemId: "item-1", attemptId: "attempt-1", source: "child", childSelfReport: "method_unknown", previousValue: "relationship", previousObservationId: "error-habit-2", actorId: "child-1", observedAt: NOW - 1_500, createdAt: NOW - 1_500 },
    { id: "error-habit-2-parent", childId: "child-1", sessionItemId: "item-1", attemptId: "attempt-1", source: "parent", parentCorrection: "calculation", previousValue: "method_unknown", previousObservationId: "error-habit-2-child", actorId: "parent-1", observedAt: NOW - 1_400, createdAt: NOW - 1_400 },
  ]).run();

  return db;
}

test("builds traceable mastery, effective errors, due reviews, and dosage", () => {
  const view = getLearningState(seedLearningState(), "child-1", NOW);

  expect(view.abilityMap.find((item) => item.skillCode === "equation-two-step"))
    .toMatchObject({
      status: "learning",
      reasonCode: "recent_five_below_basic",
      evidenceCount: 5,
      evidenceCursor: "evidence-5",
      supportingEvidenceIds: ["evidence-5"],
    });
  expect(view.abilityMap.find((item) => item.skillCode === "geometry-unseen"))
    .toMatchObject({ status: "basic", reasonCode: "legacy_snapshot", evidenceCount: 12 });
  const legacy = view.abilityMap.find((item) => item.skillCode === "geometry-unseen")!;
  expect(legacy.reason).toContain("旧版聚合快照");
  expect(legacy.reason).toContain("缺少可验证的诊断遥测");
  expect(legacy.reason).toContain("当前状态不可下钻正式证据");
  expect(legacy.reason).not.toContain("共 12 条");
  expect(view.abilityMap.find((item) => item.skillCode === "equation-two-step")?.evidence)
    .toEqual(expect.arrayContaining([expect.objectContaining({ id: "evidence-5", activeDurationMs: 49_000 })]));
  expect(view.errorSummary).toMatchObject({ knowledge: 1, habit: 2, unknown: 0 });
  expect(view.errors.find((item) => item.rootObservationId === "error-habit-2")).toMatchObject({
    effectiveCause: "calculation",
    effectiveSource: "parent",
    history: [
      expect.objectContaining({ source: "system", value: "relationship" }),
      expect.objectContaining({ source: "child", value: "method_unknown" }),
      expect.objectContaining({ source: "parent", value: "calculation" }),
    ],
  });
  expect(view.errors.find((item) => item.rootObservationId === "error-habit-1")).toMatchObject({
    firstAnswer: "7.5",
    correctedAnswer: "7.5元",
  });
  expect(view.dosage.equation).toMatchObject({
    level: 4,
    sessionMin: 4,
    sessionMax: 6,
    supportingEvidenceIds: ["evidence-4", "evidence-5"],
    recentWindow: [
      expect.objectContaining({
        sessionId: "session-4", on: "2026-08-20", totalCount: 1,
        independentCorrectCount: 1, accuracy: 1, highestHintLevel: 0,
        supportingEvidenceIds: ["evidence-4"], attemptIds: ["attempt-4"],
      }),
      expect.objectContaining({
        sessionId: "session-5", on: "2026-08-21", totalCount: 1,
        independentCorrectCount: 0, accuracy: 0, highestHintLevel: 0,
        dueReviewOutcome: "failed", supportingEvidenceIds: ["evidence-5"],
        attemptIds: ["attempt-5"],
      }),
    ],
  });
  expect(view.dosage.computation).toMatchObject({
    level: 3, reasonCode: "support", parentInterventionSuggested: true,
    supportingEvidenceIds: ["evidence-7"],
  });
  expect(view.dueReviews[0]).toMatchObject({
    skillCode: "equation-two-step", dueOn: "2026-08-23", overdueDays: 0,
    supportingEvidenceIds: ["evidence-5"],
    trigger: expect.objectContaining({
      evidenceId: "evidence-5", attemptId: "attempt-5", sessionId: "session-5",
      result: "incorrect", occurredOn: "2026-08-21", hintLevel: 0,
    }),
  });
});

test("returns only reviews due on or before the current Shanghai date", () => {
  const view = getLearningState(seedLearningState(), "child-1", Date.parse("2026-08-22T23:59:59+08:00"));
  expect(view.dueReviews).toEqual([]);
});

test("uses the last evidence id when tied events produce the current review schedule", () => {
  const db = seedLearningState();
  const tiedAt = Date.parse("2026-08-22T10:00:00+08:00");
  db.insert(trainingSessions).values([
    {
      id: "tied-session-a", childId: "child-1", sessionDate: "2026-08-22",
      kind: "practice", status: "completed", startedAt: tiedAt, completedAt: tiedAt,
    },
    {
      id: "tied-session-z", childId: "child-1", sessionDate: "2026-08-22",
      kind: "practice", status: "completed", startedAt: tiedAt, completedAt: tiedAt,
    },
  ]).run();
  db.insert(sessionItems).values([
    {
      id: "tied-item-a", sessionId: "tied-session-a", questionTemplateId: "tpl-equation",
      position: 1, stemSnapshot: "较早的同毫秒证据", answerSpecSnapshot: "{}",
      explanationSnapshot: "讲解", skillIdSnapshot: "skill-equation",
      skillNameSnapshot: "两步方程", difficultySnapshot: 4,
      structureTagSnapshot: "equation-two-step",
    },
    {
      id: "tied-item-z", sessionId: "tied-session-z", questionTemplateId: "tpl-equation",
      position: 1, stemSnapshot: "最后的同毫秒证据", answerSpecSnapshot: "{}",
      explanationSnapshot: "讲解", skillIdSnapshot: "skill-equation",
      skillNameSnapshot: "两步方程", difficultySnapshot: 4,
      structureTagSnapshot: "equation-two-step",
    },
  ]).run();
  db.insert(attempts).values([
    {
      id: "tied-attempt-a", sessionItemId: "tied-item-a", clientSubmissionId: "tied-submission-a",
      answerText: "7", isCorrect: true, normalizedAnswer: "7", explanation: "讲解",
      sessionCompleted: true, correctionNumber: 0, submittedAt: tiedAt,
    },
    {
      id: "tied-attempt-z", sessionItemId: "tied-item-z", clientSubmissionId: "tied-submission-z",
      answerText: "7", isCorrect: true, normalizedAnswer: "7", explanation: "讲解",
      sessionCompleted: true, correctionNumber: 0, submittedAt: tiedAt,
    },
  ]).run();
  db.insert(masteryEvidence).values([
    {
      id: "a-evidence-tied", childId: "child-1", skillId: "skill-equation",
      sessionItemId: "tied-item-a", templateId: "tpl-equation", purpose: "learning",
      firstAttemptCorrect: true, independent: true, hintLevel: 0, dosageTrack: "equation",
      difficulty: 4, structureTag: "equation-two-step", occurredOn: "2026-08-22",
      occurredAt: tiedAt,
    },
    {
      id: "z-evidence-tied", childId: "child-1", skillId: "skill-equation",
      sessionItemId: "tied-item-z", templateId: "tpl-equation", purpose: "learning",
      firstAttemptCorrect: true, independent: true, hintLevel: 0, dosageTrack: "equation",
      difficulty: 4, structureTag: "equation-two-step", occurredOn: "2026-08-22",
      occurredAt: tiedAt,
    },
  ]).run();

  updateLearningState(db, "z-evidence-tied");
  expect(db.select().from(reviewSchedules).where(eq(reviewSchedules.skillId, "skill-equation")).get())
    .toMatchObject({ level: 2, dueOn: "2026-08-29", updatedAt: tiedAt });
  const due = getLearningState(db, "child-1", Date.parse("2026-08-29T10:00:00+08:00"))
    .dueReviews[0];
  expect(due).toMatchObject({
    supportingEvidenceIds: ["z-evidence-tied"],
    trigger: {
      evidenceId: "z-evidence-tied", attemptId: "tied-attempt-z",
      sessionItemId: "tied-item-z", sessionId: "tied-session-z",
      occurredOn: "2026-08-22", stem: "最后的同毫秒证据",
      result: "independent_correct", firstAttemptCorrect: true, independent: true, hintLevel: 0,
    },
  });
});

test("uses the correction attempt id to bind tied corrected events to the current review schedule", () => {
  const db = seedLearningState();
  const correctedAt = Date.parse("2026-08-24T10:00:00+08:00");
  db.insert(trainingSessions).values([
    {
      id: "cross-session-a", childId: "child-1", sessionDate: "2026-08-24",
      kind: "practice", status: "completed", startedAt: correctedAt - 1_000,
      completedAt: correctedAt,
    },
    {
      id: "cross-session-z", childId: "child-1", sessionDate: "2026-08-24",
      kind: "practice", status: "completed", startedAt: correctedAt - 1_000,
      completedAt: correctedAt,
    },
  ]).run();
  db.insert(sessionItems).values([
    {
      id: "cross-item-a", sessionId: "cross-session-a", questionTemplateId: "tpl-equation",
      position: 1, stemSnapshot: "证据 a，订正事件 z", answerSpecSnapshot: "{}",
      explanationSnapshot: "讲解", skillIdSnapshot: "skill-equation",
      skillNameSnapshot: "两步方程", difficultySnapshot: 4,
      structureTagSnapshot: "equation-two-step",
    },
    {
      id: "cross-item-z", sessionId: "cross-session-z", questionTemplateId: "tpl-equation",
      position: 1, stemSnapshot: "证据 z，订正事件 a", answerSpecSnapshot: "{}",
      explanationSnapshot: "讲解", skillIdSnapshot: "skill-equation",
      skillNameSnapshot: "两步方程", difficultySnapshot: 4,
      structureTagSnapshot: "equation-two-step",
    },
  ]).run();
  db.insert(attempts).values([
    {
      id: "cross-first-a", sessionItemId: "cross-item-a", clientSubmissionId: "cross-first-submission-a",
      answerText: "6", isCorrect: false, normalizedAnswer: "6", explanation: "讲解",
      sessionCompleted: false, correctionNumber: 0, submittedAt: correctedAt - 1_000,
    },
    {
      id: "z-correction-event", sessionItemId: "cross-item-a",
      clientSubmissionId: "cross-correction-submission-z", answerText: "7", isCorrect: true,
      normalizedAnswer: "7", explanation: "讲解", sessionCompleted: true,
      correctionNumber: 1, submittedAt: correctedAt,
    },
    {
      id: "cross-first-z", sessionItemId: "cross-item-z", clientSubmissionId: "cross-first-submission-z",
      answerText: "6", isCorrect: false, normalizedAnswer: "6", explanation: "讲解",
      sessionCompleted: false, correctionNumber: 0, submittedAt: correctedAt - 1_000,
    },
    {
      id: "a-correction-event", sessionItemId: "cross-item-z",
      clientSubmissionId: "cross-correction-submission-a", answerText: "7", isCorrect: true,
      normalizedAnswer: "7", explanation: "讲解", sessionCompleted: true,
      correctionNumber: 1, submittedAt: correctedAt,
    },
  ]).run();
  db.insert(masteryEvidence).values([
    {
      id: "a-evidence-cross", childId: "child-1", skillId: "skill-equation",
      sessionItemId: "cross-item-a", templateId: "tpl-equation", purpose: "learning",
      firstAttemptCorrect: false, independent: false, hintLevel: 0, dosageTrack: "equation",
      difficulty: 4, structureTag: "equation-two-step", occurredOn: "2026-08-24",
      occurredAt: correctedAt - 1_000,
    },
    {
      id: "z-evidence-cross", childId: "child-1", skillId: "skill-equation",
      sessionItemId: "cross-item-z", templateId: "tpl-equation", purpose: "learning",
      firstAttemptCorrect: false, independent: false, hintLevel: 0, dosageTrack: "equation",
      difficulty: 4, structureTag: "equation-two-step", occurredOn: "2026-08-24",
      occurredAt: correctedAt - 1_000,
    },
  ]).run();

  updateLearningState(db, "z-evidence-cross");
  expect(db.select().from(reviewSchedules).where(eq(reviewSchedules.skillId, "skill-equation")).get())
    .toMatchObject({ level: 0, dueOn: "2026-08-25", lastResult: "corrected", updatedAt: correctedAt });
  const due = getLearningState(db, "child-1", Date.parse("2026-08-25T10:00:00+08:00"))
    .dueReviews[0];
  expect(due).toMatchObject({
    level: 0, dueOn: "2026-08-25", lastResult: "corrected",
    supportingEvidenceIds: ["a-evidence-cross"],
    trigger: expect.objectContaining({
      evidenceId: "a-evidence-cross", attemptId: "z-correction-event",
      sessionItemId: "cross-item-a", sessionId: "cross-session-a",
      occurredOn: "2026-08-24", stem: "证据 a，订正事件 z", result: "corrected",
    }),
  });
});

test("binds a diagnostic reset to its run event and exposes the whole evidence batch", () => {
  const db = seedLearningState();
  const completedAt = Date.parse("2026-08-26T10:00:00+08:00");
  db.insert(diagnosticRuns).values({
    id: "diagnostic-run-batch", childId: "child-1", version: 1,
    status: "completed", currentPart: 3, seed: "batch-seed",
    startedAt: completedAt - 60_000, completedAt,
  }).run();
  db.insert(trainingSessions).values({
    id: "diagnostic-batch-session", childId: "child-1", sessionDate: "2026-08-26",
    kind: "diagnostic", diagnosticRunId: "diagnostic-run-batch", diagnosticPartNumber: 3,
    status: "completed", startedAt: completedAt - 60_000, completedAt,
  }).run();
  db.insert(sessionItems).values([
    {
      id: "diagnostic-batch-item-a", sessionId: "diagnostic-batch-session",
      questionTemplateId: "tpl-equation", position: 1, stemSnapshot: "诊断批次证据 a",
      answerSpecSnapshot: "{}", explanationSnapshot: "讲解", skillIdSnapshot: "skill-equation",
      skillNameSnapshot: "两步方程", difficultySnapshot: 4,
      structureTagSnapshot: "equation-two-step",
    },
    {
      id: "diagnostic-batch-item-z", sessionId: "diagnostic-batch-session",
      questionTemplateId: "tpl-equation", position: 2, stemSnapshot: "诊断批次证据 z",
      answerSpecSnapshot: "{}", explanationSnapshot: "讲解", skillIdSnapshot: "skill-equation",
      skillNameSnapshot: "两步方程", difficultySnapshot: 4,
      structureTagSnapshot: "equation-two-step",
    },
  ]).run();
  db.insert(attempts).values([
    {
      id: "diagnostic-batch-attempt-a", sessionItemId: "diagnostic-batch-item-a",
      clientSubmissionId: "diagnostic-batch-submission-a", answerText: "7", isCorrect: true,
      normalizedAnswer: "7", explanation: "讲解", sessionCompleted: false,
      correctionNumber: 0, submittedAt: completedAt - 2_000,
    },
    {
      id: "diagnostic-batch-attempt-z", sessionItemId: "diagnostic-batch-item-z",
      clientSubmissionId: "diagnostic-batch-submission-z", answerText: "6", isCorrect: false,
      normalizedAnswer: "6", explanation: "讲解", sessionCompleted: true,
      correctionNumber: 0, submittedAt: completedAt - 1_000,
    },
  ]).run();
  db.insert(masteryEvidence).values([
    {
      id: "a-diagnostic-batch-evidence", childId: "child-1", skillId: "skill-equation",
      sessionItemId: "diagnostic-batch-item-a", templateId: "tpl-equation", purpose: "diagnostic",
      firstAttemptCorrect: true, independent: true, hintLevel: 0, dosageTrack: "equation",
      difficulty: 4, structureTag: "equation-two-step", occurredOn: "2026-08-26",
      occurredAt: completedAt - 2_000, diagnosticRunId: "diagnostic-run-batch",
      diagnosticCompletedOn: "2026-08-26", diagnosticCompletedAt: completedAt,
    },
    {
      id: "z-diagnostic-batch-evidence", childId: "child-1", skillId: "skill-equation",
      sessionItemId: "diagnostic-batch-item-z", templateId: "tpl-equation", purpose: "diagnostic",
      firstAttemptCorrect: false, independent: false, hintLevel: 0, dosageTrack: "equation",
      difficulty: 4, structureTag: "equation-two-step", occurredOn: "2026-08-26",
      occurredAt: completedAt - 1_000, diagnosticRunId: "diagnostic-run-batch",
      diagnosticCompletedOn: "2026-08-26", diagnosticCompletedAt: completedAt,
    },
  ]).run();

  updateLearningState(db, "z-diagnostic-batch-evidence");
  expect(db.select().from(reviewSchedules).where(eq(reviewSchedules.skillId, "skill-equation")).get())
    .toMatchObject({ level: 0, dueOn: "2026-08-27", lastResult: null, updatedAt: completedAt });
  const due = getLearningState(db, "child-1", Date.parse("2026-08-27T10:00:00+08:00"))
    .dueReviews[0];
  expect(due).toMatchObject({
    level: 0, dueOn: "2026-08-27", lastResult: null,
    supportingEvidenceIds: ["a-diagnostic-batch-evidence", "z-diagnostic-batch-evidence"],
    trigger: expect.objectContaining({
      evidenceId: "z-diagnostic-batch-evidence", attemptId: "diagnostic-batch-attempt-z",
      sessionItemId: "diagnostic-batch-item-z", sessionId: "diagnostic-batch-session",
      occurredOn: "2026-08-26", stem: "诊断批次证据 z", result: "diagnostic_reset",
    }),
  });
});
