import { eq } from "drizzle-orm";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { instantiateTemplate, questionFingerprint } from "@/domain/questions/instantiate-template";
import { createTestDatabase } from "@/test/test-db";
import { questionInstances, questionTemplates, skills, questionBankRefreshes } from "@/db/schema";
import { ensureQuestionBankFresh } from "./question-bank-refresh";

function seedCatalog() {
  const db = createTestDatabase();
  db.insert(skills).values(phase2Skills).run();
  db.insert(questionTemplates).values(phase2Catalog.map((template) => {
    const instance = instantiateTemplate(template, `seed:${template.id}`);
    return {
      id: template.id,
      skillId: `skill-${template.skillCode}`,
      domain: template.domain,
      contentTier: template.contentTier,
      structureTag: template.structureTag,
      estimatedSeconds: template.estimatedSeconds,
      readingLoad: template.readingLoad,
      answerMode: template.answerMode,
      variantSpec: JSON.stringify(template.variantSpec),
      hintLadder: JSON.stringify(template.hintLadder),
      commonErrors: JSON.stringify(template.commonErrors),
      readingCard: template.readingCard,
      source: template.source,
      licenseStatus: template.licenseStatus,
      stem: instance.stem,
      answerSpec: JSON.stringify(instance.answerSpec),
      explanation: instance.explanation,
      difficulty: template.difficulty,
      active: true,
    };
  })).run();
  return db;
}

test("refreshes the reviewed bank once per Shanghai week and deduplicates fingerprints", () => {
  const db = seedCatalog();

  const first = ensureQuestionBankFresh(db, "2026-09-04", { now: 1 });
  expect(first).toMatchObject({
    skipped: false,
    generated: expect.any(Number),
  });
  expect(first.generated).toBeLessThanOrEqual(40);
  expect(db.select().from(questionInstances).where(eq(questionInstances.active, true)).all().length)
    .toBeGreaterThan(0);
  expect(ensureQuestionBankFresh(db, "2026-09-05", { now: 2 }))
    .toEqual({ skipped: true, generated: 0, errors: [] });
  const instances = db.select().from(questionInstances).all();
  expect(new Set(instances.map((row) => row.fingerprint)).size).toBe(instances.length);
  expect(db.select().from(questionBankRefreshes).all()).toHaveLength(1);
});

test("scoped refreshes only replenish the requested skill and never exceed forty inserts", () => {
  const db = seedCatalog();
  const skillId = `skill-${phase2Catalog[0].skillCode}`;

  const result = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [skillId], force: true, now: 3 });
  expect(result.skipped).toBe(false);
  expect(result.generated).toBeLessThanOrEqual(40);
  expect(new Set(db.select({ skillId: questionInstances.skillId }).from(questionInstances).all().map((row) => row.skillId)))
    .toEqual(new Set([skillId]));
});

test("records invalid reviewed variants and does not persist them", () => {
  const db = seedCatalog();
  const target = phase2Catalog.find((template) => template.id === "num-int-mental-01")!;
  const index = phase2Catalog.indexOf(target);
  const original = phase2Catalog[index];
  phase2Catalog[index] = {
    ...target,
    variantSpec: { variables: { left: [38], right: [7], answer: [999] } },
  };

  try {
    const result = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [`skill-${target.skillCode}`], force: true, now: 4 });
    expect(result.errors.some((error) => error.includes("incorrect_number_answer"))).toBe(true);
    expect(db.select().from(questionInstances).where(eq(questionInstances.templateId, target.id)).all()).toEqual([]);
  } finally {
    phase2Catalog[index] = original;
  }
});

test("fingerprints the template, rendered stem, and answer specification", () => {
  expect(questionFingerprint({
    templateId: "template",
    stem: "1 + 1 = ?",
    answerSpec: { kind: "number", value: 2, tolerance: 0, unit: null },
  })).toBe("ca8de646f24b5b615fa1bbbbf0af8e249196705b712226c9575996968814e7fd");
});
