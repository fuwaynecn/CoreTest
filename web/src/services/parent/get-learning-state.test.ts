import {
  attempts,
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
import { createTestDatabase } from "@/test/test-db";
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
    kind: index === 4 ? "review" as const : "practice" as const,
    status: "completed" as const,
    startedAt: NOW - (7 - index) * 86_400_000,
    completedAt: NOW - (7 - index) * 86_400_000 + 1_000,
  }))).run();
  db.insert(sessionItems).values(items).run();

  db.insert(attempts).values(items.map((item, index) => ({
    id: `attempt-${index + 1}`,
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
    submittedAt: NOW - (7 - index) * 86_400_000 + 500,
  }))).run();
  db.insert(attempts).values({
    id: "attempt-reading-corrected",
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
  ]).run();
  db.insert(reviewSchedules).values({ childId: "child-1", skillId: "skill-equation", level: 1, dueOn: "2026-08-23", lastResult: "independent_correct", updatedAt: NOW }).run();
  db.insert(dosageStates).values([
    { childId: "child-1", track: "equation", level: 4, weeklyTarget: 18, sessionMinimum: 4, sessionTarget: 5, sessionMaximum: 6, reasonJson: JSON.stringify({ reasonCode: "hold", sameStructureCap: 6, parentInterventionSuggested: false }), updatedAt: NOW },
    { childId: "child-1", track: "computation", level: 3, weeklyTarget: 72, sessionMinimum: 12, sessionTarget: 15, sessionMaximum: 19, reasonJson: JSON.stringify({ reasonCode: "support", sameStructureCap: 6, parentInterventionSuggested: true }), updatedAt: NOW },
  ]).run();

  db.insert(errorObservations).values([
    { id: "error-knowledge", childId: "child-1", sessionItemId: "item-5", attemptId: "attempt-5", source: "system", systemCandidate: "relationship", observedAt: NOW - 2_000, createdAt: NOW - 2_000 },
    { id: "error-habit-1", childId: "child-1", sessionItemId: "item-6", attemptId: "attempt-6", source: "system", systemCandidate: "missing_unit", observedAt: NOW - 1_800, createdAt: NOW - 1_800 },
    { id: "error-habit-1-child", childId: "child-1", sessionItemId: "item-6", attemptId: "attempt-6", source: "child", childSelfReport: "missed_condition_or_unit", previousValue: "missing_unit", previousObservationId: "error-habit-1", actorId: "child-1", observedAt: NOW - 1_700, createdAt: NOW - 1_700 },
    { id: "error-habit-2", childId: "child-1", sessionItemId: "item-1", attemptId: "attempt-1", source: "system", systemCandidate: "relationship", observedAt: NOW - 1_600, createdAt: NOW - 1_600 },
    { id: "error-habit-2-child", childId: "child-1", sessionItemId: "item-1", attemptId: "attempt-1", source: "child", childSelfReport: "method_unknown", previousValue: "relationship", previousObservationId: "error-habit-2", actorId: "child-1", observedAt: NOW - 1_500, createdAt: NOW - 1_500 },
    { id: "error-habit-2-parent", childId: "child-1", sessionItemId: "item-1", attemptId: "attempt-1", source: "parent", parentCorrection: "calculation", previousValue: "method_unknown", previousObservationId: "error-habit-2-child", actorId: "parent-1", observedAt: NOW - 1_400, createdAt: NOW - 1_400 },
  ]).run();

  return db;
}

test("builds traceable mastery, effective errors, due reviews, and dosage", () => {
  const view = getLearningState(seedLearningState(), "child-1", NOW);

  expect(view.abilityMap.find((item) => item.skillCode === "equation-two-step"))
    .toMatchObject({ status: "learning", reasonCode: "recent_five_below_basic", evidenceCount: 5 });
  expect(view.abilityMap.find((item) => item.skillCode === "geometry-unseen"))
    .toMatchObject({ status: "undiagnosed", reasonCode: "no_evidence", evidenceCount: 0 });
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
  expect(view.dosage.equation).toMatchObject({ level: 4, sessionMin: 4, sessionMax: 6 });
  expect(view.dosage.computation).toMatchObject({ level: 3, reasonCode: "support", parentInterventionSuggested: true });
  expect(view.dueReviews[0]).toMatchObject({ skillCode: "equation-two-step", dueOn: "2026-08-23", overdueDays: 0 });
});

test("returns only reviews due on or before the current Shanghai date", () => {
  const view = getLearningState(seedLearningState(), "child-1", Date.parse("2026-08-22T23:59:59+08:00"));
  expect(view.dueReviews).toEqual([]);
});
