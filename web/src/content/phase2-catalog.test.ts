import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { instantiateTemplate } from "@/domain/questions/instantiate-template";
import { validateCatalog } from "@/domain/questions/template-schema";
import { phase2Catalog } from "./phase2-catalog";

const expectedIds = [
  "num-int-mental-01", "num-int-mental-02",
  "num-decimal-01", "num-decimal-02", "num-decimal-03",
  "num-fraction-01", "num-fraction-02", "num-fraction-03",
  "num-mixed-01", "num-mixed-02",
  "num-law-01", "num-law-02",
  "num-estimate-01", "num-estimate-02",
  "num-reverse-check-01", "num-reverse-check-02",
  "eq-l1-balance-01", "eq-l1-balance-02", "eq-l1-balance-03",
  "eq-l2-add-sub-01", "eq-l2-add-sub-02", "eq-l2-add-sub-03",
  "eq-l3-mul-div-01", "eq-l3-mul-div-02", "eq-l3-mul-div-03",
  "eq-l4-two-step-01", "eq-l4-two-step-02", "eq-l4-two-step-03",
  "eq-l5-complex-01", "eq-l5-complex-02", "eq-l5-complex-03",
  "eq-l6-model-01", "eq-l6-model-02", "eq-l6-model-03",
  "geo-angle-01", "geo-perimeter-01", "geo-perimeter-02",
  "geo-area-01", "geo-area-02", "geo-volume-01", "geo-composite-01", "geo-spatial-01",
  "data-table-01", "data-bar-01", "data-line-01", "data-average-01",
  "data-compare-01", "data-possibility-01",
  "app-price-01", "app-price-02", "app-distance-01", "app-distance-02",
  "app-work-01", "app-work-02", "app-ratio-01", "app-ratio-02",
  "app-percent-01", "app-percent-02", "app-multi-step-01", "app-multi-step-02",
  "app-extra-info-01", "app-extra-info-02",
  "habit-question-01", "habit-question-02", "habit-condition-01", "habit-condition-02",
  "habit-unit-01", "habit-unit-02", "habit-estimate-01", "habit-estimate-02",
  "habit-check-01", "habit-check-02",
];

const regionalIds = [
  "num-estimate-02", "num-reverse-check-02", "geo-spatial-01",
  "data-table-01", "data-bar-01", "data-line-01", "data-compare-01",
  "app-price-02", "app-distance-02", "app-work-02", "app-ratio-02",
  "app-percent-02", "app-multi-step-01", "app-extra-info-01",
  "habit-question-02", "habit-condition-02", "habit-unit-02", "habit-estimate-01",
];

const transitionIds = [
  "eq-l6-model-03", "geo-composite-01", "app-multi-step-02", "app-extra-info-02",
  "habit-estimate-02", "habit-check-01", "habit-check-02",
];

function countBy<K extends "contentTier" | "domain">(key: K) {
  return phase2Catalog.reduce<Record<string, number>>((counts, template) => {
    counts[template[key]] = (counts[template[key]] ?? 0) + 1;
    return counts;
  }, {});
}

test("contains the approved exact 72-template blueprint", () => {
  expect(phase2Catalog.map((template) => template.id)).toEqual(expectedIds);
  expect(countBy("contentTier")).toEqual({ core: 47, regional: 18, transition: 7 });
  expect(countBy("domain")).toEqual({
    number_operations: 16,
    equation_algebra: 18,
    geometry_space: 8,
    data_statistics: 6,
    application_modeling: 14,
    thinking_habits: 10,
  });
  expect(phase2Catalog.filter(({ contentTier }) => contentTier === "regional")
    .map(({ id }) => id)).toEqual(regionalIds);
  expect(phase2Catalog.filter(({ contentTier }) => contentTier === "transition")
    .map(({ id }) => id)).toEqual(transitionIds);
  expect(validateCatalog(phase2Catalog)).toEqual([]);
});

test("instantiates the same valid question for the same seed", () => {
  const template = phase2Catalog.find((item) => item.id === "eq-l4-two-step-01")!;
  const first = instantiateTemplate(template, "run-2:slot-7");

  expect(first).toEqual(instantiateTemplate(template, "run-2:slot-7"));
  expect(first).toMatchObject({
    templateId: "eq-l4-two-step-01",
    variantSeed: "run-2:slot-7",
    domain: "equation_algebra",
  });
  expect(() => answerSpecSchema.parse(first.answerSpec)).not.toThrow();
});

test("every reviewed template produces deterministic scoreable variants", () => {
  for (const template of phase2Catalog) {
    for (const seed of ["catalog-a", "catalog-b", "catalog-c", "catalog-d"]) {
      const instance = instantiateTemplate(template, seed);
      expect(instance).toEqual(instantiateTemplate(template, seed));
      expect(answerSpecSchema.safeParse(instance.answerSpec).success).toBe(true);
      expect(instance.stem).not.toContain("{{");
      expect(instance.explanation).not.toContain("{{");
    }
  }
});

test("each equation level covers solving, step reasoning, and modeling or checking", () => {
  for (let level = 1; level <= 6; level += 1) {
    const templates = phase2Catalog.filter(({ id }) => id.startsWith(`eq-l${level}-`));
    expect(templates.map(({ structureTag }) => structureTag)).toEqual([
      "equation-direct", "equation-step", "equation-model-check",
    ]);
  }
});

test("regional templates carry the intended reading and explanation emphasis", () => {
  const regional = phase2Catalog.filter(({ contentTier }) => contentTier === "regional");

  expect(regional.every(({ readingLoad }) => readingLoad !== "short")).toBe(true);
  expect(regional.every(({ explanationPattern, readingCard }) => (
    readingCard || explanationPattern.includes("关系") || explanationPattern.includes("信息")
  ))).toBe(true);
});
