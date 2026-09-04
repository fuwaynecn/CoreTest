import { eq } from "drizzle-orm";
import { questionInstances, questionTemplates, sessionItems, skills, trainingSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { listQuestionBank, updateQuestionBankItem } from "./question-bank";

function fixture() {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "x", createdAt: 1 }).run();
  db.insert(skills).values([
    { id: "skill-z", code: "z-code", name: "Z技能", domain: "number_operations" },
    { id: "skill-a", code: "a-code", name: "A技能", domain: "equation_algebra" },
  ]).run();
  db.insert(questionTemplates).values({
    id: "template-1", skillId: "skill-z", domain: "number_operations", structureTag: "addition", answerMode: "written",
    stem: "模板题干", answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanation: "模板解析", difficulty: 1,
  }).run();
  db.insert(questionInstances).values([
    { id: "instance-z", templateId: "template-1", skillId: "skill-z", variantSeed: "z", variables: "{}", stem: "9 - 2 = ?", answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanation: "7", difficulty: 2, fingerprint: "fp-z", active: true, generatedAt: 10, updatedAt: 11, lastUsedAt: 12 },
    { id: "instance-a", templateId: "template-1", skillId: "skill-a", variantSeed: "a", variables: "{}", stem: "8 - 3 = ?", answerSpec: JSON.stringify({ kind: "number", value: 5, tolerance: 0, unit: null }), explanation: "5", difficulty: 1, fingerprint: "fp-a", active: true, generatedAt: 10, updatedAt: 11, lastUsedAt: null },
    { id: "instance-off", templateId: "template-1", skillId: "skill-z", variantSeed: "off", variables: "{}", stem: "停用题", answerSpec: JSON.stringify({ kind: "number", value: 1, tolerance: 0, unit: null }), explanation: "1", difficulty: 1, fingerprint: "fp-off", active: false, generatedAt: 10, updatedAt: 11, lastUsedAt: null },
  ]).run();
  db.insert(trainingSessions).values({ id: "session-1", childId: "child-1", sessionDate: "2026-09-01", kind: "daily", status: "completed", startedAt: 1 }).run();
  db.insert(sessionItems).values({
    id: "item-1", sessionId: "session-1", questionTemplateId: "template-1", questionInstanceId: "instance-z", position: 0,
    stemSnapshot: "9 - 2 = ?", answerSpecSnapshot: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanationSnapshot: "7",
    skillIdSnapshot: "skill-z", skillNameSnapshot: "Z技能", difficultySnapshot: 2,
  }).run();
  return db;
}

test("filters and orders the question bank deterministically, capped at 100", () => {
  const db = fixture();
  expect(listQuestionBank(db, {}).map((row) => row.id)).toEqual(["instance-a", "instance-z", "instance-off"]);
  expect(listQuestionBank(db, { status: "active", domain: "equation_algebra", skillId: "skill-a", difficulty: 1 }).map((row) => row.id)).toEqual(["instance-a"]);
  expect(listQuestionBank(db, { status: "inactive" }).map((row) => row.id)).toEqual(["instance-off"]);
  expect(listQuestionBank(db, {}).every((row) => row.templateId === "template-1")).toBe(true);
});

test("edits an instance without deleting it or changing historical snapshots", () => {
  const db = fixture();
  const before = db.select().from(sessionItems).where(eq(sessionItems.id, "item-1")).get()!;
  const row = updateQuestionBankItem(db, "instance-z", {
    stem: "口算：3 + 4 = ?", answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null }, explanation: "新的解析", skillId: "skill-a", difficulty: 3, active: false,
  }, 99);
  expect(row).toMatchObject({ id: "instance-z", stem: "口算：3 + 4 = ?", skillId: "skill-a", difficulty: 3, active: false, domain: "equation_algebra", templateId: "template-1" });
  expect(db.select().from(questionInstances).all()).toHaveLength(3);
  expect(db.select().from(sessionItems).where(eq(sessionItems.id, "item-1")).get()).toEqual(before);
  expect(db.select().from(questionInstances).where(eq(questionInstances.id, "instance-z")).get()).toMatchObject({ fingerprint: "fp-z", generatedAt: 10, lastUsedAt: 12, updatedAt: 99 });
});

test("rejects an unknown instance", () => {
  expect(() => updateQuestionBankItem(fixture(), "missing", {
    stem: "1 + 1 = ?", answerSpec: { kind: "number", value: 2, tolerance: 0, unit: null }, explanation: "2", skillId: "skill-z", difficulty: 1, active: true,
  }, 99)).toThrow("question_bank_item_not_found");
});
