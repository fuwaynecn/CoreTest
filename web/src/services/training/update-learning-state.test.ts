import { eq } from "drizzle-orm";
import { vi } from "vitest";
import type { AppDatabase } from "@/db/client";
import {
  attempts, diagnosticRuns, dosageStates, errorObservations, masteryEvidence, masteryStates,
  questionTemplates, reviewSchedules, sessionItems, skills, trainingSessions, users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { recordLearningEvidence, type RecordLearningEvidenceCommand } from "./record-learning-evidence";
import { submitAttempt } from "./submit-attempt";
import { updateLearningState } from "./update-learning-state";

function seed() {
  const db = createTestDatabase();
  db.insert(users).values({
    id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1,
  }).run();
  db.insert(skills).values([
    { id: "skill-computation", code: "decimal", name: "小数", domain: "number_operations" },
    { id: "skill-equation", code: "equation-l1", name: "方程", domain: "equation_algebra" },
  ]).run();
  db.insert(questionTemplates).values([
    { id: "template-computation", skillId: "skill-computation", stem: "1+1",
      answerSpec: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }),
      explanation: "", difficulty: 1, domain: "number_operations" },
    { id: "template-equation", skillId: "skill-equation", stem: "x=1",
      answerSpec: JSON.stringify({ kind: "number", value: 1, tolerance: 0, unit: null }),
      explanation: "", difficulty: 1, domain: "equation_algebra" },
  ]).run();
  return db;
}

let sequence = 0;
function appendEvidence(db: AppDatabase, input: {
  skillId?: "skill-computation" | "skill-equation";
  purpose?: "diagnostic" | "learning" | "review";
  on: string;
  correct?: boolean;
  independent?: boolean;
  hintLevel?: 0 | 1 | 2 | 3;
  reviewIntervalDays?: 0 | 1 | 3 | 7 | 14 | 30;
  sessionId?: string;
  diagnosticCompletedOn?: string;
  status?: "in_progress" | "completed";
  structureTag?: string;
  dosageTrack?: "computation" | "equation" | null;
}) {
  sequence += 1;
  const skillId = input.skillId ?? "skill-computation";
  const templateId = skillId === "skill-equation" ? "template-equation" : "template-computation";
  const sessionId = input.sessionId ?? `session-${sequence}`;
  const itemId = `item-${sequence}`;
  const purpose = input.purpose ?? "learning";
  const occurredAt = Date.parse(`${input.on}T04:00:00.000Z`) + sequence;
  const status = input.status ?? "completed";
  const structureTag = input.structureTag ?? `${skillId}-structure`;
  if (!db.select().from(trainingSessions).where(eq(trainingSessions.id, sessionId)).get()) {
    db.insert(trainingSessions).values({
      id: sessionId, childId: "child-1", sessionDate: input.on,
      kind: purpose === "diagnostic" ? "diagnostic" : purpose === "review" ? "review" : "daily",
      status, startedAt: occurredAt, completedAt: status === "completed" ? occurredAt : null,
    }).run();
  }
  db.insert(sessionItems).values({
    id: itemId, sessionId, questionTemplateId: templateId, position: sequence,
    stemSnapshot: "snapshot", answerSpecSnapshot: "{}", explanationSnapshot: "",
    skillIdSnapshot: skillId, skillNameSnapshot: skillId,
    structureTagSnapshot: structureTag, difficultySnapshot: 1,
  }).run();
  const diagnosticCompletedOn = input.diagnosticCompletedOn ?? input.on;
  const diagnosticRunId = purpose === "diagnostic" ? `run-${diagnosticCompletedOn}` : null;
  if (diagnosticRunId && !db.select().from(diagnosticRuns)
    .where(eq(diagnosticRuns.id, diagnosticRunId)).get()) {
    db.insert(diagnosticRuns).values({
      id: diagnosticRunId, childId: "child-1", version: sequence,
      status: "completed", currentPart: 3, seed: diagnosticRunId,
      startedAt: occurredAt, completedAt: Date.parse(`${diagnosticCompletedOn}T05:00:00.000Z`),
    }).run();
  }
  const command: RecordLearningEvidenceCommand = {
    childId: "child-1", skillId, sessionItemId: itemId, templateId,
    purpose, firstAttemptCorrect: input.correct ?? true,
    independent: input.independent ?? true, hintLevel: input.hintLevel ?? 0,
    dosageTrack: input.dosageTrack === undefined
      ? skillId === "skill-equation" ? "equation" : "computation"
      : input.dosageTrack,
    difficulty: 1, structureTag, occurredOn: input.on, occurredAt,
    diagnosticRunId,
    diagnosticCompletedOn: purpose === "diagnostic" ? diagnosticCompletedOn : null,
    diagnosticCompletedAt: purpose === "diagnostic"
      ? Date.parse(`${diagnosticCompletedOn}T05:00:00.000Z`) : null,
    reviewIntervalDays: input.reviewIntervalDays ?? (purpose === "review" ? 1 : 0),
  };
  return { itemId, evidence: recordLearningEvidence(db, command) };
}

test("diagnosis initializes review conservatively and creates both dosage tracks", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-20", diagnosticCompletedOn: "2026-08-22" });

  expect(db.select().from(reviewSchedules).all()).toEqual([
    expect.objectContaining({
      childId: "child-1", skillId: "skill-computation", level: 0,
      dueOn: "2026-08-23", lastResult: null,
    }),
  ]);
  expect(db.select().from(dosageStates).all()).toEqual(expect.arrayContaining([
    expect.objectContaining({ track: "computation", level: 1, weeklyTarget: 60 }),
    expect.objectContaining({ track: "equation", level: 1, weeklyTarget: 15 }),
  ]));
  expect(db.select().from(dosageStates).all().map((row) => JSON.parse(row.reasonJson)))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "insufficient_evidence", sameStructureCap: 6 }),
      expect.objectContaining({ reasonCode: "insufficient_evidence", sameStructureCap: 6 }),
    ]));
});

test("cross-day independent sessions advance review and dosage, while a failed due review supports", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(db, { on: "2026-08-20" });
  const second = appendEvidence(db, {
    purpose: "review", on: "2026-08-21", reviewIntervalDays: 1,
  });

  expect(db.select().from(reviewSchedules).get()).toMatchObject({
    level: 2, dueOn: "2026-08-28", lastResult: "independent_correct",
  });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 2, weeklyTarget: 60, sessionMinimum: 12, sessionTarget: 15, sessionMaximum: 19 });

  updateLearningState(db, second.evidence.id);
  expect(db.select().from(reviewSchedules).get()).toMatchObject({ level: 2, dueOn: "2026-08-28" });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 2, weeklyTarget: 60 });

  appendEvidence(db, { purpose: "review", on: "2026-08-28", correct: false, reviewIntervalDays: 7 });
  expect(db.select().from(reviewSchedules).get()).toMatchObject({
    level: 0, dueOn: "2026-08-29", lastResult: "incorrect",
  });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 1, weeklyTarget: 60, sessionTarget: 15 });
});

test("dosage replay uses the immutable evidence track after the skill domain changes", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(db, { on: "2026-08-20" });
  const trigger = appendEvidence(db, {
    purpose: "review", on: "2026-08-21", reviewIntervalDays: 1,
  });
  const before = db.select().from(dosageStates).all().toSorted((left, right) => (
    left.track.localeCompare(right.track)
  ));

  db.update(skills).set({ domain: "equation_algebra" })
    .where(eq(skills.id, "skill-computation")).run();
  updateLearningState(db, trigger.evidence.id);

  expect(db.select().from(dosageStates).all().toSorted((left, right) => (
    left.track.localeCompare(right.track)
  ))).toEqual(before);
});

test("unknown legacy dosage tracks do not get forced into the current skill domain", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18", dosageTrack: null });
  appendEvidence(db, { on: "2026-08-20", dosageTrack: null });
  appendEvidence(db, {
    purpose: "review", on: "2026-08-21", reviewIntervalDays: 1, dosageTrack: null,
  });

  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 1 });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "equation")).get())
    .toMatchObject({ level: 1 });
});

test("a level-one hint is supported rather than independent and lowers review level", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(db, { on: "2026-08-20" });
  appendEvidence(db, { on: "2026-08-21", independent: false, hintLevel: 1 });
  expect(db.select().from(reviewSchedules).get()).toMatchObject({
    level: 0, dueOn: "2026-08-22", lastResult: "hinted_correct",
  });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 1 });
});

test("a completed diagnosis starts a conservative new dosage window", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(db, { on: "2026-08-20" });
  appendEvidence(db, { purpose: "review", on: "2026-08-21", reviewIntervalDays: 1 });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 2 });

  appendEvidence(db, {
    purpose: "diagnostic", on: "2026-08-22", diagnosticCompletedOn: "2026-08-24",
  });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 1, weeklyTarget: 60 });
  expect(JSON.parse(db.select().from(dosageStates)
    .where(eq(dosageStates.track, "computation")).get()!.reasonJson))
    .toMatchObject({ reasonCode: "insufficient_evidence" });
});

test("in-progress formal sessions do not contribute dosage until completion", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(db, { on: "2026-08-20", status: "in_progress" });
  const pendingReview = appendEvidence(db, {
    purpose: "review", on: "2026-08-21", reviewIntervalDays: 1, status: "in_progress",
  });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 1 });

  db.update(trainingSessions).set({ status: "completed", completedAt: Date.now() }).run();
  updateLearningState(db, pendingReview.evidence.id);
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 2 });
});

test("multiple completed sessions on one Shanghai day cause at most one dosage transition", () => {
  const db = seed();
  appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(db, { on: "2026-08-20" });
  appendEvidence(db, {
    purpose: "review", on: "2026-08-21", reviewIntervalDays: 1, sessionId: "review-a",
  });
  appendEvidence(db, {
    purpose: "review", on: "2026-08-21", reviewIntervalDays: 1, sessionId: "review-b",
  });
  expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
    .toMatchObject({ level: 2 });
});

test("six weak same-structure items suggest intervention but six correct items do not", () => {
  const weak = seed();
  appendEvidence(weak, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(weak, { on: "2026-08-20" });
  for (let index = 0; index < 6; index += 1) {
    appendEvidence(weak, {
      purpose: index === 0 ? "review" : "learning",
      reviewIntervalDays: index === 0 ? 1 : 0,
      on: "2026-08-21", sessionId: "weak-six", structureTag: "same-structure",
      correct: index < 4,
    });
  }
  expect(JSON.parse(weak.select().from(dosageStates)
    .where(eq(dosageStates.track, "computation")).get()!.reasonJson))
    .toMatchObject({ reasonCode: "support", parentInterventionSuggested: true });

  const fluent = seed();
  appendEvidence(fluent, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(fluent, { on: "2026-08-20" });
  for (let index = 0; index < 6; index += 1) {
    appendEvidence(fluent, {
      purpose: index === 0 ? "review" : "learning",
      reviewIntervalDays: index === 0 ? 1 : 0,
      on: "2026-08-21", sessionId: "fluent-six", structureTag: "same-structure",
    });
  }
  for (let index = 0; index < 4; index += 1) {
    appendEvidence(fluent, {
      on: "2026-08-21", sessionId: "fluent-six", structureTag: "other-structure",
      correct: false,
    });
  }
  expect(JSON.parse(fluent.select().from(dosageStates)
    .where(eq(dosageStates.track, "computation")).get()!.reasonJson))
    .toMatchObject({ reasonCode: "support", parentInterventionSuggested: false });
});

test("intervention cap stays per-session and survives stronger structures", () => {
  const split = seed();
  appendEvidence(split, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(split, { on: "2026-08-20" });
  for (const sessionId of ["weak-three-a", "weak-three-b"]) {
    for (let index = 0; index < 3; index += 1) {
      appendEvidence(split, {
        purpose: "review", reviewIntervalDays: 1,
        on: "2026-08-21", sessionId, structureTag: "same-structure", correct: false,
      });
    }
  }
  expect(JSON.parse(split.select().from(dosageStates)
    .where(eq(dosageStates.track, "computation")).get()!.reasonJson))
    .toMatchObject({ reasonCode: "support", parentInterventionSuggested: false });

  const mixed = seed();
  appendEvidence(mixed, { purpose: "diagnostic", on: "2026-08-18" });
  appendEvidence(mixed, { on: "2026-08-20" });
  for (let index = 0; index < 6; index += 1) {
    appendEvidence(mixed, {
      on: "2026-08-21", sessionId: "mixed-session", structureTag: "weak-structure",
      correct: index < 4,
    });
  }
  for (let index = 0; index < 20; index += 1) {
    appendEvidence(mixed, {
      purpose: index === 0 ? "review" : "learning",
      reviewIntervalDays: index === 0 ? 1 : 0,
      on: "2026-08-21", sessionId: "mixed-session", structureTag: "strong-structure",
    });
  }
  expect(mixed.select().from(dosageStates)
    .where(eq(dosageStates.track, "computation")).get()).toMatchObject({ level: 2 });
  expect(JSON.parse(mixed.select().from(dosageStates)
    .where(eq(dosageStates.track, "computation")).get()!.reasonJson))
    .toMatchObject({ reasonCode: "advance", parentInterventionSuggested: true });
});

test("a correct correction replaces the wrong review outcome without rewriting mastery evidence", () => {
  vi.useFakeTimers();
  try {
    const db = seed();
    appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
    appendEvidence(db, { on: "2026-08-19" });
    appendEvidence(db, { on: "2026-08-20" });
    appendEvidence(db, { on: "2026-08-21" });
    expect(db.select().from(reviewSchedules).get()).toMatchObject({ level: 3 });

    const submittedAt = new Date("2026-08-23T04:00:00.000Z");
    vi.setSystemTime(submittedAt);
    db.insert(trainingSessions).values({
      id: "correction-review", childId: "child-1", sessionDate: "2026-08-23",
      kind: "review", status: "in_progress", startedAt: submittedAt.getTime(),
    }).run();
    db.insert(sessionItems).values({
      id: "correction-item", sessionId: "correction-review",
      questionTemplateId: "template-computation", position: 1,
      stemSnapshot: "1+1", answerSpecSnapshot: JSON.stringify({
        kind: "number", value: 2, tolerance: 0, unit: null,
      }), explanationSnapshot: "1+1=2", skillIdSnapshot: "skill-computation",
      skillNameSnapshot: "小数", structureTagSnapshot: "same-structure",
      selectionReasonSnapshot: JSON.stringify({ reviewIntervalDays: 14 }),
    }).run();

    submitAttempt(db, { childId: "child-1", sessionItemId: "correction-item",
      clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "0" });
    expect(db.select().from(reviewSchedules).get()).toMatchObject({
      level: 0, dueOn: "2026-08-24", lastResult: "incorrect",
    });
    submitAttempt(db, { childId: "child-1", sessionItemId: "correction-item",
      clientSubmissionId: "22222222-2222-4222-8222-222222222222", answerText: "1" });
    expect(db.select().from(reviewSchedules).get()).toMatchObject({ lastResult: "incorrect" });
    vi.setSystemTime(new Date("2026-08-23T05:00:00.000Z"));
    submitAttempt(db, { childId: "child-1", sessionItemId: "correction-item",
      clientSubmissionId: "33333333-3333-4333-8333-333333333333", answerText: "2" });

    const evidence = db.select().from(masteryEvidence)
      .where(eq(masteryEvidence.sessionItemId, "correction-item")).all();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ firstAttemptCorrect: false, independent: true });
    expect(db.select().from(attempts)
      .where(eq(attempts.sessionItemId, "correction-item")).all()).toHaveLength(3);
    expect(db.select().from(reviewSchedules).get()).toMatchObject({
      level: 2, dueOn: "2026-08-30", lastResult: "corrected",
      updatedAt: new Date("2026-08-23T05:00:00.000Z").getTime(),
    });

    updateLearningState(db, evidence[0].id);
    expect(db.select().from(reviewSchedules).get()).toMatchObject({
      level: 2, dueOn: "2026-08-30", lastResult: "corrected",
    });
  } finally {
    vi.useRealTimers();
  }
});

test("the final correct attempt completes the session before dosage derivation", () => {
  vi.useFakeTimers();
  try {
    const db = seed();
    appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
    appendEvidence(db, { on: "2026-08-20" });
    vi.setSystemTime(new Date("2026-08-21T04:00:00.000Z"));
    db.insert(trainingSessions).values({
      id: "final-review", childId: "child-1", sessionDate: "2026-08-21",
      kind: "review", status: "in_progress", startedAt: Date.now(),
    }).run();
    db.insert(sessionItems).values({
      id: "final-review-item", sessionId: "final-review",
      questionTemplateId: "template-computation", position: 1,
      stemSnapshot: "1+1", answerSpecSnapshot: JSON.stringify({
        kind: "number", value: 2, tolerance: 0, unit: null,
      }), explanationSnapshot: "1+1=2", skillIdSnapshot: "skill-computation",
      skillNameSnapshot: "小数", structureTagSnapshot: "same-structure",
      selectionReasonSnapshot: JSON.stringify({
        reviewIntervalDays: 1,
        dosageTrack: "computation",
      }),
    }).run();
    submitAttempt(db, { childId: "child-1", sessionItemId: "final-review-item",
      clientSubmissionId: "44444444-4444-4444-8444-444444444444", answerText: "2" });

    expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, "final-review")).get())
      .toMatchObject({ status: "completed" });
    expect(db.select().from(dosageStates).where(eq(dosageStates.track, "computation")).get())
      .toMatchObject({ level: 2 });
  } finally {
    vi.useRealTimers();
  }
});

test("a forced reducer failure rolls the containing attempt transaction back", () => {
  const db = seed();
  const before = appendEvidence(db, { purpose: "diagnostic", on: "2026-08-18" });
  const baseline = {
    mastery: db.select().from(masteryStates).all(),
    review: db.select().from(reviewSchedules).all(),
    dosage: db.select().from(dosageStates).all(),
  };
  const occurredAt = Date.parse("2026-08-20T04:00:00.000Z");
  db.insert(trainingSessions).values({
    id: "rollback-session", childId: "child-1", sessionDate: "2026-08-20",
    kind: "daily", status: "completed", startedAt: occurredAt, completedAt: occurredAt,
  }).run();
  db.insert(sessionItems).values({
    id: "rollback-item", sessionId: "rollback-session", questionTemplateId: "template-computation",
    position: 1, stemSnapshot: "1+1", answerSpecSnapshot: "{}", explanationSnapshot: "",
    skillIdSnapshot: "skill-computation", skillNameSnapshot: "小数", structureTagSnapshot: "decimal",
  }).run();

  expect(() => db.transaction((tx) => {
    tx.insert(attempts).values({
      id: "rollback-attempt", sessionItemId: "rollback-item", clientSubmissionId: "rollback-submission",
      answerText: "0", isCorrect: false, normalizedAnswer: "0", explanation: "",
      sessionCompleted: false, submittedAt: occurredAt,
    }).run();
    tx.insert(errorObservations).values({
      id: "rollback-error", childId: "child-1", sessionItemId: "rollback-item",
      attemptId: "rollback-attempt", source: "system", systemCandidate: "calculation",
      observedAt: occurredAt, createdAt: occurredAt,
    }).run();
    recordLearningEvidence(tx, {
      childId: "child-1", skillId: "skill-computation", sessionItemId: "rollback-item",
      templateId: "template-computation", purpose: "learning", firstAttemptCorrect: false,
      independent: true, hintLevel: 0, dosageTrack: "computation", difficulty: 1, structureTag: "decimal",
      occurredOn: "invalid-date", occurredAt, diagnosticRunId: null,
      diagnosticCompletedOn: null, diagnosticCompletedAt: null, reviewIntervalDays: 0,
    });
  }, { behavior: "immediate" })).toThrow("Invalid time value");

  expect(db.select().from(attempts).where(eq(attempts.id, "rollback-attempt")).get()).toBeUndefined();
  expect(db.select().from(errorObservations).where(eq(errorObservations.id, "rollback-error")).get()).toBeUndefined();
  expect(db.select().from(masteryEvidence).all()).toHaveLength(1);
  expect(db.select().from(masteryEvidence).get()?.id).toBe(before.evidence.id);
  expect(db.select().from(masteryStates).all()).toEqual(baseline.mastery);
  expect(db.select().from(reviewSchedules).all()).toEqual(baseline.review);
  expect(db.select().from(dosageStates).all()).toEqual(baseline.dosage);
});

test("database constraints reject out-of-range dosage and review snapshots", () => {
  const db = seed();
  expect(() => db.insert(reviewSchedules).values({
    childId: "child-1", skillId: "skill-computation", level: 5,
    dueOn: "2026-08-20", lastResult: null, updatedAt: 1,
  }).run()).toThrow();
  expect(() => db.insert(dosageStates).values({
    childId: "child-1", track: "equation", level: 7, weeklyTarget: 21,
    sessionMinimum: 3, sessionTarget: 7, sessionMaximum: 8,
    reasonJson: "{}", updatedAt: 1,
  }).run()).toThrow();
});
