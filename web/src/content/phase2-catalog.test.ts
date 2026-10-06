import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { instantiateTemplate } from "@/domain/questions/instantiate-template";
import { validateCatalog } from "@/domain/questions/template-schema";
import { phase2Catalog, phase2Skills } from "./phase2-catalog";
import { pepSkillSchedule } from "./pep-skill-schedule";

const expectedIds = [
  "num-int-mental-01", "num-int-mental-02",
  "num-decimal-01", "num-decimal-02", "num-decimal-03",
  "num-fraction-01", "num-fraction-02", "num-fraction-03",
  "num-mixed-01", "num-mixed-02",
  "num-law-01", "num-law-02",
  "num-estimate-01", "num-estimate-02",
  "num-reverse-check-01", "num-reverse-check-02",
  "num-int-mental-03", "num-decimal-04", "num-fraction-04", "num-mixed-03",
  "num-law-03", "num-estimate-03", "num-reverse-check-03",
  "eq-l1-balance-01", "eq-l1-balance-02", "eq-l1-balance-03",
  "eq-l2-add-sub-01", "eq-l2-add-sub-02", "eq-l2-add-sub-03",
  "eq-l3-mul-div-01", "eq-l3-mul-div-02", "eq-l3-mul-div-03",
  "eq-l4-two-step-01", "eq-l4-two-step-02", "eq-l4-two-step-03",
  "eq-l5-complex-01", "eq-l5-complex-02", "eq-l5-complex-03",
  "eq-l6-model-01", "eq-l6-model-02", "eq-l6-model-03",
  "eq-l1-balance-04", "eq-l2-add-sub-04", "eq-l3-mul-div-04",
  "eq-l4-two-step-04", "eq-l5-complex-04", "eq-l6-model-04", "eq-l6-model-05",
  "geo-angle-01", "geo-perimeter-01", "geo-perimeter-02",
  "geo-area-01", "geo-area-02", "geo-volume-01", "geo-composite-01", "geo-spatial-01",
  "geo-angle-02", "geo-angle-03", "geo-perimeter-03", "geo-perimeter-04",
  "geo-area-03", "geo-area-04", "geo-length-convert-01", "geo-volume-03",
  "geo-composite-02", "geo-spatial-02",
  "data-table-01", "data-bar-01", "data-line-01", "data-average-01",
  "data-compare-01", "data-possibility-01",
  "data-table-02", "data-table-03", "data-bar-02", "data-bar-03", "data-line-02",
  "data-average-02", "data-average-03", "data-compare-02", "data-possibility-02",
  "app-price-01", "app-price-02", "app-distance-01", "app-distance-02",
  "app-work-01", "app-work-02", "app-ratio-01", "app-ratio-02",
  "app-percent-01", "app-percent-02", "app-multi-step-01", "app-multi-step-02",
  "app-extra-info-01", "app-extra-info-02",
  "app-price-03", "app-distance-03", "app-work-03", "app-ratio-03", "app-percent-03",
  "app-multi-step-03", "app-multi-step-04", "app-extra-info-03", "app-extra-info-04",
  "habit-question-01", "habit-question-02", "habit-condition-01", "habit-condition-02",
  "habit-unit-01", "habit-unit-02", "habit-estimate-01", "habit-estimate-02",
  "habit-check-01", "habit-check-02",
  "habit-question-03", "habit-condition-03", "habit-unit-03", "habit-estimate-03",
  "habit-estimate-04", "habit-check-03",
  "geo-circle-radius-diameter", "geo-circle-diameter-radius",
  "geo-circle-circumference-d", "geo-circle-circumference-r",
  "geo-circle-area", "geo-circle-ring-area", "geo-circle-concept-choice",
  "geo-pd-relative-1", "geo-pd-relative-2", "geo-pd-sides",
  "geo-pd-route", "geo-pd-return", "geo-pd-route-length",
  "geo-pd-three-length",
  "data-pie-read-people", "data-pie-books", "data-pie-total-reverse",
  "data-pie-diff", "data-pie-expense", "data-pie-choose", "data-pie-judge",
  "think-ns-odd-sum", "think-ns-square-dots", "think-ns-triangle-dots",
  "think-ns-fraction-sum", "think-ns-l-layers",
  "think-ns-dot-explain", "think-ns-next-figure",
  "num-fracops-01", "num-fracops-02", "num-fracops-03",
  "app-fracops-04", "app-fracops-05",
  "num-pctm-decimal", "num-pctm-percent",
  "app-pctm-qualified", "app-pctm-attendance",
  "num-pctm-of", "app-pctm-choice",
  "app-pcta-discount", "app-pcta-cheng", "app-pcta-tax",
  "app-pcta-interest", "app-pcta-total",
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

function countBy<K extends "contentTier" | "domain" | "difficulty">(key: K) {
  return phase2Catalog.reduce<Record<string, number>>((counts, template) => {
    const bucket = String(template[key]);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    return counts;
  }, {});
}

test("contains the approved exact 164-template blueprint", () => {
  expect(phase2Catalog.map((template) => template.id)).toEqual(expectedIds);
  expect(countBy("contentTier")).toEqual({ core: 139, regional: 18, transition: 7 });
  expect(phase2Skills).toHaveLength(44);
  expect(countBy("domain")).toEqual({
    number_operations: 29,
    equation_algebra: 25,
    geometry_space: 32,
    data_statistics: 22,
    application_modeling: 33,
    thinking_habits: 23,
  });
  expect(countBy("difficulty")).toEqual({ 1: 28, 2: 64, 3: 51, 4: 21 });
  expect(phase2Catalog.filter(({ contentTier }) => contentTier === "regional")
    .map(({ id }) => id)).toEqual(regionalIds);
  expect(phase2Catalog.filter(({ contentTier }) => contentTier === "transition")
    .map(({ id }) => id)).toEqual(transitionIds);
  expect(validateCatalog(phase2Catalog)).toEqual([]);
});

test("includes the four grade-6 semester-1 skeleton skills with aligned schedule", () => {
  const newCodes = ["position-direction", "circle", "pie-chart", "number-shape"];
  expect(phase2Skills.map((skill) => skill.code)).toEqual(
    expect.arrayContaining(newCodes),
  );

  const expectedSchedule = {
    "position-direction": { grade: 6, semester: 1, expectedWeek: 4 },
    circle: { grade: 6, semester: 1, expectedWeek: 9 },
    "pie-chart": { grade: 6, semester: 1, expectedWeek: 16 },
    "number-shape": { grade: 6, semester: 1, expectedWeek: 17 },
  } as const;

  for (const [code, expected] of Object.entries(expectedSchedule)) {
    expect(pepSkillSchedule[code]).toMatchObject(expected);
  }
});

test("declares reviewed incomplete-reading targets on actual reading templates", () => {
  expect(phase2Catalog.find(({ id }) => id === "habit-question-01")?.errorTargets)
    .toEqual({ incompleteReading: ["A", "B", "D"] });
  expect(phase2Catalog.find(({ id }) => id === "habit-question-02")?.errorTargets)
    .toEqual({ incompleteReading: ["A", "B", "D"] });
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
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates.map(({ structureTag }) => structureTag)).toEqual(expect.arrayContaining([
      "equation-direct", "equation-step", "equation-model-check",
    ]));
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

  expect(choiceTemplates).toHaveLength(47);
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

  expect(numberTemplates).toHaveLength(102);
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

  expect(equationTemplates).toHaveLength(15);
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

  expect(numericTemplates).toHaveLength(117);
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

test("rejects every unrelated true equation across the habit-check canonical variants", () => {
  const template = phase2Catalog.find(({ id }) => id === "habit-check-02")!;
  const unrelatedTrueChecks = {
    ...template,
    id: "renamed-habit-check",
    structureTag: "renamed-habit-check",
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        inverse: ["55 + 1 = 56", "100 + 1 = 101", "8 + 1 = 9"],
      },
    },
  };

  expect(validateCatalog([unrelatedTrueChecks])).toEqual(expect.arrayContaining([
    "renamed-habit-check:incorrect_choice_answer:variant-0",
    "renamed-habit-check:incorrect_choice_answer:variant-1",
    "renamed-habit-check:incorrect_choice_answer:variant-2",
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

test("flags a wrong numeric answer on the circle area template", () => {
  const template = phase2Catalog.find(({ id }) => id === "geo-circle-area")!;
  const wrongAnswer = {
    ...template,
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: template.variantSpec.variables.answer.map((value) => Number(value) + 999),
      },
    },
  };

  expect(validateCatalog([wrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});

test("flags an unsupported stem pattern on the circle area template", () => {
  const template = phase2Catalog.find(({ id }) => id === "geo-circle-area")!;
  const unsupportedStem = {
    ...template,
    stemPattern: "圆形草坪的半径是 {{r}} 米（π 取 3.14），草坪的周长是多少米？",
  };

  expect(validateCatalog([unsupportedStem])).toEqual(expect.arrayContaining([
    expect.stringContaining("unsupported_number_pattern"),
  ]));
});

test("flags a changed correct option on the circle concept choice template", () => {
  const template = phase2Catalog.find(({ id }) => id === "geo-circle-concept-choice")!;
  const changedCorrectOption = {
    ...template,
    stemPattern: template.stemPattern.replace("同一个圆的直径长度是半径的 2 倍", "圆的直径长度等于半径"),
  };

  expect(validateCatalog([changedCorrectOption])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("flags a changed correct option text on the position relative template", () => {
  const template = phase2Catalog.find(({ id }) => id === "geo-pd-relative-1")!;
  const changedCorrectOption = {
    ...template,
    stemPattern: template.stemPattern.replace("南偏西 {{deg}}°", "西偏南 {{deg}}°"),
  };

  expect(validateCatalog([changedCorrectOption])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("flags a wrong numeric answer on the position route length template", () => {
  const template = phase2Catalog.find(({ id }) => id === "geo-pd-route-length")!;
  const wrongAnswer = {
    ...template,
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: template.variantSpec.variables.answer.map((value) => Number(value) + 999),
      },
    },
  };

  expect(validateCatalog([wrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});

test("flags a wrong numeric answer on the pie reverse-total template", () => {
  const template = phase2Catalog.find(({ id }) => id === "data-pie-total-reverse")!;
  const wrongAnswer = {
    ...template,
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: template.variantSpec.variables.answer.map((value) => Number(value) + 999),
      },
    },
  };

  expect(validateCatalog([wrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});

test("flags a swapped choice answer on the pie choose template", () => {
  const template = phase2Catalog.find(({ id }) => id === "data-pie-choose")!;
  const swappedChoice = {
    ...template,
    answerSpecPattern: { kind: "choice", value: "B" },
  };

  expect(validateCatalog([swappedChoice])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("flags a wrong numeric answer on the number-shape triangle dots template", () => {
  const template = phase2Catalog.find(({ id }) => id === "think-ns-triangle-dots")!;
  const wrongAnswer = {
    ...template,
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: template.variantSpec.variables.answer.map((value) => Number(value) + 1),
      },
    },
  };

  expect(validateCatalog([wrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});

test("flags a swapped choice answer on the number-shape dot explain template", () => {
  const template = phase2Catalog.find(({ id }) => id === "think-ns-dot-explain")!;
  const swappedChoice = {
    ...template,
    answerSpecPattern: { kind: "choice", value: "B" },
  };

  expect(validateCatalog([swappedChoice])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("拆分后无悬空引用：每个模板的 skillCode 都有对应 skill", () => {
  const skillCodes = new Set(phase2Skills.map((skill) => skill.code));
  const dangling = phase2Catalog
    .filter((template) => !skillCodes.has(template.skillCode))
    .map((template) => template.id);
  expect(dangling).toEqual([]);
});

test("fraction 拆分映射与 schedule 对齐", () => {
  const skillOf = (id: string) => phase2Catalog.find((template) => template.id === id)?.skillCode;
  expect(skillOf("num-fraction-01")).toBe("fraction");
  expect(skillOf("num-fraction-02")).toBe("fraction");
  expect(skillOf("num-fraction-03")).toBe("fraction-ops");
  expect(skillOf("num-fraction-04")).toBe("fraction-ops");
  expect(pepSkillSchedule.fraction).toMatchObject({ grade: 5, semester: 2, expectedWeek: 15 });
  expect(pepSkillSchedule["fraction-ops"]).toMatchObject({ grade: 6, semester: 1, expectedWeek: 7 });
});

test("flags wrong numeric answers on the fraction-ops application and calculation templates", () => {
  for (const id of ["app-fracops-04", "num-fracops-02"]) {
    const template = phase2Catalog.find((item) => item.id === id)!;
    const wrongAnswer = {
      ...template,
      variantSpec: {
        variables: {
          ...template.variantSpec.variables,
          answer: template.variantSpec.variables.answer.map((value) => Number(value) + 999),
        },
      },
    };

    expect(validateCatalog([wrongAnswer]), id).toEqual(expect.arrayContaining([
      expect.stringContaining("incorrect_number_answer"),
    ]));
  }
});

test("percent 拆分映射与 schedule 对齐", () => {
  const skillOf = (id: string) => phase2Catalog.find((template) => template.id === id)?.skillCode;
  expect(skillOf("app-percent-01")).toBe("percent-apply");
  expect(skillOf("app-percent-02")).toBe("percent-model");
  expect(skillOf("app-percent-03")).toBe("percent-apply");
  expect(pepSkillSchedule["percent-model"]).toMatchObject({
    grade: 6, semester: 1, expectedWeek: 15,
  });
  expect(pepSkillSchedule["percent-apply"]).toMatchObject({
    grade: 6, semester: 2, expectedWeek: 3,
  });
});

test("flags a wrong numeric answer on the percent-model percent-of template", () => {
  const template = phase2Catalog.find((item) => item.id === "num-pctm-of")!;
  const wrongAnswer = {
    ...template,
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: template.variantSpec.variables.answer.map((value) => Number(value) + 999),
      },
    },
  };

  expect(validateCatalog([wrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});

test("flags a swapped choice answer on the percent-model inequality choice template", () => {
  const template = phase2Catalog.find((item) => item.id === "app-pctm-choice")!;
  const swappedChoice = {
    ...template,
    answerSpecPattern: { kind: "choice", value: "B" },
  };

  expect(validateCatalog([swappedChoice])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_choice_answer"),
  ]));
});

test("flags a wrong numeric answer on the percent-apply interest template", () => {
  const template = phase2Catalog.find((item) => item.id === "app-pcta-interest")!;
  const wrongAnswer = {
    ...template,
    variantSpec: {
      variables: {
        ...template.variantSpec.variables,
        answer: template.variantSpec.variables.answer.map((value) => Number(value) + 999),
      },
    },
  };

  expect(validateCatalog([wrongAnswer])).toEqual(expect.arrayContaining([
    expect.stringContaining("incorrect_number_answer"),
  ]));
});
