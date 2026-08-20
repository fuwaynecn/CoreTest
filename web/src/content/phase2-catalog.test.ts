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

test("rejects answer and choice mutations of canonical catalog templates", () => {
  const numberTemplate = phase2Catalog.find(({ id }) => id === "num-int-mental-01")!;
  const choiceTemplate = phase2Catalog.find(({ id }) => id === "num-estimate-01")!;
  const wrongNumber = {
    ...numberTemplate,
    variantSpec: {
      variables: {
        ...numberTemplate.variantSpec.variables,
        answer: [999, 999, 999],
      },
    },
  };
  const duplicateChoice = {
    ...choiceTemplate,
    variantSpec: {
      variables: {
        ...choiceTemplate.variantSpec.variables,
        a: choiceTemplate.variantSpec.variables.b,
      },
    },
  };
  const wrongChoiceAnswer = {
    ...choiceTemplate,
    answerSpecPattern: { kind: "choice", value: "A" },
  };

  expect(validateCatalog([wrongNumber])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
  expect(validateCatalog([duplicateChoice])).toEqual(expect.arrayContaining([
    expect.stringContaining("duplicate_choice_option"),
  ]));
  expect(validateCatalog([wrongChoiceAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("rejects a wrong answer label for every canonical choice template", () => {
  const nextLabel = { A: "B", B: "C", C: "D", D: "A" } as const;
  const choiceTemplates = phase2Catalog.filter(({ answerMode }) => answerMode === "choice");

  expect(choiceTemplates).toHaveLength(23);
  for (const template of choiceTemplates) {
    const answer = template.answerSpecPattern as { kind: "choice"; value: keyof typeof nextLabel };
    const mutated = {
      ...template,
      id: `renamed-${template.id}`,
      structureTag: `renamed-${template.structureTag}`,
      answerSpecPattern: { kind: "choice", value: nextLabel[answer.value] },
    };

    expect(validateCatalog([mutated]), template.id).toEqual(expect.arrayContaining([
      expect.stringContaining("incorrect_choice_answer"),
    ]));
  }
});

test("rejects a wrong generated answer for every supported numeric template", () => {
  const numberTemplates = phase2Catalog.filter((template) => (
    template.answerMode !== "equation"
    && (template.answerSpecPattern as { kind?: string }).kind === "number"
  ));

  expect(numberTemplates).toHaveLength(38);
  for (const template of numberTemplates) {
    const answers = template.variantSpec.variables.answer;
    const mutated = {
      ...template,
      id: `renamed-${template.id}`,
      structureTag: `renamed-${template.structureTag}`,
      variantSpec: {
        variables: {
          ...template.variantSpec.variables,
          answer: answers.map((answer) => Number(answer) + 999),
        },
      },
    };

    expect(validateCatalog([mutated]), template.id).toEqual(expect.arrayContaining([
      expect.stringContaining("incorrect_number_answer"),
    ]));
  }
});

test("rejects a wrong solution for every canonical equation after metadata renaming", () => {
  const equationTemplates = phase2Catalog.filter((template) => (
    template.answerMode === "equation"
    && (template.answerSpecPattern as { kind?: string }).kind === "number"
  ));

  expect(equationTemplates).toHaveLength(11);
  for (const template of equationTemplates) {
    const answers = template.variantSpec.variables.answer;
    const mutated = {
      ...template,
      id: `renamed-${template.id}`,
      structureTag: `renamed-${template.structureTag}`,
      variantSpec: {
        variables: {
          ...template.variantSpec.variables,
          answer: answers.map((answer) => Number(answer) + 999),
        },
      },
    };

    expect(validateCatalog([mutated]), template.id).toEqual(expect.arrayContaining([
      expect.stringContaining("incorrect_equation_answer"),
    ]));
  }
});

test("rejects a wrong unit for every canonical numeric target without metadata dispatch", () => {
  const numericTemplates = phase2Catalog.filter((template) => (
    (template.answerSpecPattern as { kind?: string }).kind === "number"
  ));

  expect(numericTemplates).toHaveLength(49);
  for (const template of numericTemplates) {
    const answer = template.answerSpecPattern as {
      kind: "number"; value: unknown; tolerance: number; unit: string | null;
    };
    const mutated = {
      ...template,
      id: `renamed-${template.id}`,
      structureTag: `renamed-${template.structureTag}`,
      answerSpecPattern: {
        ...answer,
        unit: answer.unit === "米" ? "厘米" : "米",
      },
    };

    expect(validateCatalog([mutated]), template.id).toEqual(expect.arrayContaining([
      expect.stringContaining("unit_mismatch"),
    ]));
  }
});

test("rejects units that contradict canonical rendered answer targets", () => {
  const unitless = phase2Catalog.find(({ id }) => id === "num-int-mental-01")!;
  const boxes = phase2Catalog.find(({ id }) => id === "eq-l4-two-step-03")!;

  expect(validateCatalog([{
    ...unitless,
    answerSpecPattern: { ...unitless.answerSpecPattern as object, unit: "米" },
  }])).toEqual(expect.arrayContaining([expect.stringContaining("unit_mismatch")]));
  expect(validateCatalog([{
    ...boxes,
    answerSpecPattern: { ...boxes.answerSpecPattern as object, unit: "米" },
  }])).toEqual(expect.arrayContaining([expect.stringContaining("unit_mismatch")]));
});

test("derives numeric correctness from rendered arithmetic rather than metadata", () => {
  const template = phase2Catalog.find(({ id }) => id === "num-int-mental-01")!;
  const displayedSubtraction = {
    ...template,
    stemPattern: template.stemPattern.replace("+", "-"),
  };
  const typoedTagAndAnswer = {
    ...template,
    structureTag: "mental-smu",
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: [999, 999, 999],
      },
    },
  };

  expect(validateCatalog([displayedSubtraction])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
  expect(validateCatalog([typoedTagAndAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});

test("derives choice correctness from rendered content after an id rename", () => {
  const template = phase2Catalog.find(({ id }) => id === "habit-condition-01")!;
  const renamedWrongAnswer = {
    ...template,
    id: "renamed-habit-condition",
    answerSpecPattern: { kind: "choice", value: "B" },
  };

  expect(validateCatalog([renamedWrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("rejects inverse and checking evidence disconnected from the rendered claim", () => {
  const inverse = phase2Catalog.find(({ id }) => id === "num-reverse-check-01")!;
  const evidence = phase2Catalog.find(({ id }) => id === "habit-check-02")!;
  const unrelatedInverse = {
    ...inverse,
    variantSpec: {
      variables: {
        ...inverse.variantSpec.variables,
        claim: [999, 999, 999],
      },
    },
  };
  const unrelatedEvidence = {
    ...evidence,
    variantSpec: {
      variables: {
        ...evidence.variantSpec.variables,
        inverse: ["1 + 1 = 2", "1 + 1 = 2", "1 + 1 = 2"],
      },
    },
  };

  expect(validateCatalog([unrelatedInverse])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
  expect(validateCatalog([unrelatedEvidence])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("rejects a true check equation unrelated to the rendered original calculation", () => {
  const template = phase2Catalog.find(({ id }) => id === "num-reverse-check-02")!;
  const unrelatedCheck = {
    ...template,
    id: "renamed-error-analysis",
    structureTag: "renamed-error-analysis",
    answerSpecPattern: { kind: "choice", value: "A" },
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        claim: [9, 8.8, 168],
        check: [
          "1 + 1 是否等于 2",
          "1 + 1 是否等于 2",
          "1 + 1 是否等于 2",
        ],
      },
    },
  };

  expect(validateCatalog([unrelatedCheck])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("rejects identity equations presented as inverse-operation evidence", () => {
  const template = phase2Catalog.find(({ id }) => id === "habit-check-02")!;
  const identityEvidence = {
    ...template,
    id: "renamed-check-evidence",
    structureTag: "renamed-check-evidence",
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        inverse: ["55 + 0 = 55", "100 × 1 = 100", "8 ÷ 1 = 8"],
      },
    },
  };

  expect(validateCatalog([identityEvidence])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("rejects coincidental arithmetic that is not the original operation's inverse", () => {
  const template = phase2Catalog.find(({ id }) => id === "num-reverse-check-01")!;
  const coincidentalOptions = {
    ...template,
    id: "renamed-inverse-check",
    structureTag: "renamed-inverse-check",
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        c: ["47 × 2 - 10", "9.2 - 3 + 0.2", "105 - 20 - 70"],
      },
    },
  };

  expect(validateCatalog([coincidentalOptions])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});
