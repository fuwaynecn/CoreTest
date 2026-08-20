import { eq } from "drizzle-orm";
import {
  errorObservations, masteryStates, questionTemplates,
  sessionItems, skills, trainingSessions, users,
} from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import {
  correctErrorObservation,
  ErrorObservationAccessError,
  ErrorObservationConflictError,
  getEffectiveErrorCause,
  saveChildReflection,
} from "./error-observation-service";
import { submitAttempt } from "./submit-attempt";

function seed() {
  const db = createTestDatabase();
  db.insert(users).values([
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "x", createdAt: 1 },
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "x", createdAt: 1 },
    { id: "child-2", role: "child", displayName: "别家孩子", credentialHash: "x", createdAt: 1 },
  ]).run();
  db.insert(skills).values({ id: "skill-1", code: "decimal", name: "小数", domain: "number_operations" }).run();
  db.insert(questionTemplates).values({
    id: "template-1", skillId: "skill-1", stem: "3.2 + 2.8 = ?", difficulty: 1,
    answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
    explanation: "对齐小数点。", commonErrors: JSON.stringify(["calculation"]),
  }).run();
  db.insert(trainingSessions).values([
    { id: "session-1", childId: "child-1", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 },
    { id: "session-2", childId: "child-2", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 },
  ]).run();
  db.insert(sessionItems).values([
    item("item-1", "session-1"), item("item-2", "session-2"),
  ]).run();
  return db;
}

function item(id: string, sessionId: string) {
  return {
    id, sessionId, questionTemplateId: "template-1", position: 0,
    stemSnapshot: "3.2 + 2.8 = ?",
    answerSpecSnapshot: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }),
    explanationSnapshot: "对齐小数点。", skillIdSnapshot: "skill-1", skillNameSnapshot: "小数",
    selectionReasonSnapshot: JSON.stringify({ commonErrors: ["calculation"], estimatedSeconds: 60 }),
  };
}

test("creates a snapshot-based system observation atomically with the first wrong attempt", () => {
  const db = seed();
  db.update(questionTemplates).set({ commonErrors: JSON.stringify(["relationship"]), stem: "已修改" })
    .where(eq(questionTemplates.id, "template-1")).run();
  submitAttempt(db, {
    childId: "child-1", sessionItemId: "item-1",
    clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
  });

  expect(db.select().from(errorObservations).all()).toEqual([
    expect.objectContaining({ childId: "child-1", sessionItemId: "item-1", source: "system", systemCandidate: "calculation" }),
  ]);
});

test("appends child and parent revisions while preserving audit history and mastery", () => {
  const db = seed();
  submitAttempt(db, {
    childId: "child-1", sessionItemId: "item-1",
    clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
  });
  const masteryBefore = db.select().from(masteryStates).all();
  const system = db.select().from(errorObservations).get()!;

  const child = saveChildReflection(db, {
    childId: "child-1", sessionItemId: "item-1", reflection: "calculation_slip", now: 20,
  });
  const parent = correctErrorObservation(db, {
    actorId: "parent-1", configuredChildId: "child-1", observationId: system.id,
    cause: "relationship", now: 30,
  });

  expect(db.select().from(errorObservations).all()).toEqual([
    expect.objectContaining({ id: system.id, source: "system", systemCandidate: "calculation", actorId: null }),
    expect.objectContaining({ id: child.id, source: "child", childSelfReport: "calculation_slip", previousValue: "calculation", actorId: "child-1", observedAt: 20 }),
    expect.objectContaining({ id: parent.id, source: "parent", parentCorrection: "relationship", previousValue: "calculation_slip", actorId: "parent-1", observedAt: 30, previousObservationId: child.id }),
  ]);
  expect(getEffectiveErrorCause(db, system.id)).toMatchObject({ cause: "relationship", category: "knowledge", source: "parent" });
  expect(db.select().from(masteryStates).all()).toEqual(masteryBefore);
});

test("makes repeated reflection idempotent, rejects a conflicting second choice, and keeps one root chain", () => {
  const db = seed();
  submitAttempt(db, {
    childId: "child-1", sessionItemId: "item-1",
    clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
  });
  const first = saveChildReflection(db, { childId: "child-1", sessionItemId: "item-1", reflection: "did_not_read" });
  expect(saveChildReflection(db, { childId: "child-1", sessionItemId: "item-1", reflection: "did_not_read" }).id).toBe(first.id);
  expect(() => saveChildReflection(db, { childId: "child-1", sessionItemId: "item-1", reflection: "method_unknown" }))
    .toThrow(ErrorObservationConflictError);
  expect(db.select().from(errorObservations).all()).toHaveLength(2);
});

test("rejects child corrections and observations belonging to another configured child", () => {
  const db = seed();
  for (const [childId, itemId, submission] of [
    ["child-1", "item-1", "11111111-1111-4111-8111-111111111111"],
    ["child-2", "item-2", "22222222-2222-4222-8222-222222222222"],
  ] as const) submitAttempt(db, { childId, sessionItemId: itemId, clientSubmissionId: submission, answerText: "5" });
  const foreign = db.select().from(errorObservations).where(eq(errorObservations.childId, "child-2")).get()!;
  expect(() => correctErrorObservation(db, {
    actorId: "child-1", configuredChildId: "child-1", observationId: foreign.id, cause: "unknown",
  })).toThrow(ErrorObservationAccessError);
  expect(() => correctErrorObservation(db, {
    actorId: "parent-1", configuredChildId: "child-1", observationId: foreign.id, cause: "unknown",
  })).toThrow(ErrorObservationAccessError);
});

test("requires a child-role actor for self-reflection", () => {
  const db = seed();
  db.update(trainingSessions).set({ childId: "parent-1" }).where(eq(trainingSessions.id, "session-1")).run();
  submitAttempt(db, {
    childId: "parent-1", sessionItemId: "item-1",
    clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
  });
  expect(() => saveChildReflection(db, {
    childId: "parent-1", sessionItemId: "item-1", reflection: "calculation_slip",
  })).toThrow(ErrorObservationAccessError);
});

test("links each parent revision to the current tail even when called with a stale root id", () => {
  const db = seed();
  submitAttempt(db, {
    childId: "child-1", sessionItemId: "item-1",
    clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "5",
  });
  const root = db.select().from(errorObservations).get()!;
  const first = correctErrorObservation(db, {
    actorId: "parent-1", configuredChildId: "child-1", observationId: root.id, cause: "relationship", now: 20,
  });
  const second = correctErrorObservation(db, {
    actorId: "parent-1", configuredChildId: "child-1", observationId: root.id, cause: "missing_unit", now: 30,
  });
  expect(second).toMatchObject({ previousObservationId: first.id, previousValue: "relationship" });
  expect(getEffectiveErrorCause(db, root.id)).toMatchObject({ cause: "missing_unit", source: "parent" });
});

test("returns unknown when no deterministic cause exists", () => {
  const db = seed();
  db.update(sessionItems).set({ selectionReasonSnapshot: JSON.stringify({ commonErrors: [] }) })
    .where(eq(sessionItems.id, "item-1")).run();
  submitAttempt(db, {
    childId: "child-1", sessionItemId: "item-1",
    clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "不是数字",
  });
  expect(db.select().from(errorObservations).get()?.systemCandidate).toBe("unknown");
});
