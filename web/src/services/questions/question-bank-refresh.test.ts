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

test("scoped refreshes are idempotent and honor the thirty-day Shanghai cutoff", () => {
  const db = seedCatalog();
  const target = phase2Catalog.find((template) => template.id === "num-int-mental-01")!;
  const skillId = `skill-${target.skillCode}`;
  const recent = Date.parse("2026-08-20T12:00:00+08:00");
  db.insert(questionInstances).values(Array.from({ length: 8 }, (_, index) => ({
    id: `recent-${index}`,
    templateId: target.id,
    skillId,
    variantSeed: `recent-${index}`,
    variables: "{}",
    stem: `recent ${index}`,
    answerSpec: JSON.stringify({ kind: "number", value: index, tolerance: 0, unit: null }),
    explanation: "recent",
    difficulty: target.difficulty,
    fingerprint: `recent-fingerprint-${index}`,
    active: true,
    generatedAt: 1,
    updatedAt: 1,
    lastUsedAt: recent,
  }))).run();

  const first = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [skillId], now: 10 });
  const second = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [skillId], now: 11 });
  expect(first.generated).toBeGreaterThan(0);
  expect(first.generated).toBeLessThanOrEqual(12);
  expect(second).toEqual({ skipped: false, generated: 0, errors: [] });
  expect(db.select().from(questionInstances).where(eq(questionInstances.skillId, skillId)).all())
    .toHaveLength(8 + first.generated);
});

test("does not bypass the weekly ledger for a full force refresh", () => {
  const db = seedCatalog();
  expect(ensureQuestionBankFresh(db, "2026-09-04", { now: 20 }).skipped).toBe(false);
  expect(ensureQuestionBankFresh(db, "2026-09-04", { force: true, now: 21 }))
    .toEqual({ skipped: true, generated: 0, errors: [] });
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

test("blocks catalog-level validation errors for the affected template", () => {
  const db = seedCatalog();
  const index = phase2Catalog.findIndex((template) => template.id === "num-int-mental-01");
  const original = phase2Catalog[index];
  phase2Catalog[index] = { ...original, difficulty: 5 as never };

  try {
    const result = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [`skill-${original.skillCode}`], now: 30 });
    expect(result.errors).toContain("num-int-mental-01:invalid_template:difficulty");
    expect(db.select().from(questionInstances).where(eq(questionInstances.templateId, original.id)).all()).toEqual([]);
  } finally {
    phase2Catalog[index] = original;
  }
});

test("blocks duplicate template ids instead of materializing either duplicate", () => {
  const db = seedCatalog();
  const target = phase2Catalog.find((template) => template.id === "num-int-mental-01")!;
  phase2Catalog.push({ ...target });

  try {
    const result = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [`skill-${target.skillCode}`], now: 32 });
    expect(result.errors).toContain("num-int-mental-01:duplicate_id");
    expect(db.select().from(questionInstances).where(eq(questionInstances.templateId, target.id)).all()).toEqual([]);
  } finally {
    phase2Catalog.pop();
  }
});

test("skips unresolved placeholders rendered in explanations", () => {
  const db = seedCatalog();
  const index = phase2Catalog.findIndex((template) => template.id === "num-int-mental-01");
  const original = phase2Catalog[index];
  phase2Catalog[index] = {
    ...original,
    explanationPattern: "解析 {{note}}。",
    variantSpec: { variables: { ...original.variantSpec.variables, note: ["{{undeclared}}"] } },
  };

  try {
    const result = ensureQuestionBankFresh(db, "2026-09-04", { skillIds: [`skill-${original.skillCode}`], now: 31 });
    expect(result.errors.some((error) => error.includes("unsupported_placeholder:rendered-variant"))).toBe(true);
    expect(db.select().from(questionInstances).where(eq(questionInstances.templateId, original.id)).all()).toEqual([]);
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
