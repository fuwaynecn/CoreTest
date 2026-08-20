import type { ReviewedTemplate } from "./template-schema";
import { validateCatalog } from "./template-schema";

function validTemplate(overrides: Partial<ReviewedTemplate> = {}): ReviewedTemplate {
  return {
    id: "number-add-01",
    skillCode: "integer-mental",
    domain: "number_operations",
    contentTier: "core",
    difficulty: 1,
    structureTag: "mental-sum",
    estimatedSeconds: 30,
    readingLoad: "short",
    answerMode: "mental",
    stemPattern: "计算 {{left}} + {{right}}。",
    answerSpecPattern: {
      kind: "number",
      value: "{{answer}}",
      tolerance: 0,
      unit: null,
    },
    explanationPattern: "把 {{left}} 和 {{right}} 相加，得到 {{answer}}。",
    commonErrors: ["calculation"],
    hintLadder: ["先看个位。", "把两个数分位相加。", "算完再做一次逆运算。"],
    readingCard: false,
    source: "original",
    licenseStatus: "owned",
    variantSpec: {
      variables: {
        left: [18, 27],
        right: [7, 16],
        answer: [25, 43],
      },
    },
    ...overrides,
  };
}

test("accepts a complete original reviewed template", () => {
  expect(validateCatalog([validTemplate()])).toEqual([]);
});

test.each([
  {
    name: "duplicate template ids",
    catalog: [validTemplate(), validTemplate()],
    expected: "duplicate_id",
  },
  {
    name: "empty variable ranges",
    catalog: [validTemplate({
      variantSpec: { variables: { left: [], right: [7], answer: [25] } },
    })],
    expected: "empty_variable_range",
  },
  {
    name: "unsupported placeholders",
    catalog: [validTemplate({ stemPattern: "计算 {{not_allowed}} + 1。" })],
    expected: "unsupported_placeholder",
  },
  {
    name: "malformed placeholders beside valid ones",
    catalog: [validTemplate({ stemPattern: "计算 {{left}} + {{broken。" })],
    expected: "unsupported_placeholder",
  },
  {
    name: "placeholders injected into a rendered hint by an allowed string variable",
    catalog: [validTemplate({
      hintLadder: ["先检查 {{note}}。", "再检查数量关系。", "最后检查答案。"],
      variantSpec: {
        variables: {
          left: [18], right: [7], answer: [25], note: ["{{undeclared}}"],
        },
      },
    })],
    expected: "unsupported_placeholder",
  },
  {
    name: "answer specs outside the scoring contract",
    catalog: [validTemplate({
      answerSpecPattern: { kind: "text", value: "二十五" },
    })],
    expected: "invalid_answer_spec",
  },
  {
    name: "non-positive estimated time",
    catalog: [validTemplate({ estimatedSeconds: 0 })],
    expected: "invalid_template",
  },
  {
    name: "unit prompts without a required answer unit",
    catalog: [validTemplate({
      stemPattern: "绳子还剩 {{answer}} 米，请在答案中写单位。",
    })],
    expected: "missing_unit",
  },
  {
    name: "quantity questions whose requested unit is omitted from the answer",
    catalog: [validTemplate({ stemPattern: "绳子还剩多少米？" })],
    expected: "missing_unit",
  },
  {
    name: "a source-unit substring that differs from the requested answer unit",
    catalog: [validTemplate({
      structureTag: "custom-unit-target",
      stemPattern: "绳子原长 2 米，剪去 30 厘米，还剩多少厘米？",
      answerSpecPattern: { kind: "number", value: 170, tolerance: 0, unit: "米" },
      explanationPattern: "先统一单位，再计算剩余长度。",
    })],
    expected: "unit_mismatch",
  },
  {
    name: "mixed source units with the wrong requested result unit",
    catalog: [validTemplate({
      structureTag: "custom-unit-target",
      stemPattern: "步道前段长 3 米，后段长 50 厘米，全长是多少米？",
      answerSpecPattern: { kind: "number", value: 350, tolerance: 0, unit: "厘米" },
      explanationPattern: "先统一单位，再计算总长度。",
    })],
    expected: "unit_mismatch",
  },
  {
    name: "a non-equation answer key inconsistent with its generated operands",
    catalog: [validTemplate({
      variantSpec: {
        variables: { left: [18], right: [7], answer: [999] },
      },
    })],
    expected: "incorrect_number_answer",
  },
  {
    name: "duplicate choice options that make more than one label correct",
    catalog: [validTemplate({
      structureTag: "direct-choice",
      answerMode: "choice",
      stemPattern: "计算 18 + 7。A. 24  B. 25  C. 25  D. 26",
      answerSpecPattern: { kind: "choice", value: "B" },
      explanationPattern: "先计算，再选择唯一对应的选项。",
    })],
    expected: "duplicate_choice_option",
  },
  {
    name: "a choice answer label that does not match the computed result",
    catalog: [validTemplate({
      structureTag: "direct-choice",
      answerMode: "choice",
      stemPattern: "计算 18 + 7。A. 24  B. 26  C. 25  D. 27",
      answerSpecPattern: { kind: "choice", value: "B" },
      explanationPattern: "先计算，再选择唯一对应的选项。",
    })],
    expected: "incorrect_choice_answer",
  },
  {
    name: "equations without a unique solution",
    catalog: [validTemplate({
      answerMode: "equation",
      stemPattern: "解方程：{{coefficient}}x = {{right}}。",
      answerSpecPattern: {
        kind: "number",
        value: "{{answer}}",
        tolerance: 0,
        unit: null,
      },
      explanationPattern: "代入答案检查等号两边。",
      variantSpec: {
        variables: { coefficient: [0], right: [5], answer: [0] },
      },
    })],
    expected: "unsolvable_equation",
  },
  {
    name: "equation answer keys that do not solve the equation",
    catalog: [validTemplate({
      answerMode: "equation",
      stemPattern: "解方程：{{coefficient}}x + {{offset}} = {{right}}。",
      answerSpecPattern: {
        kind: "number",
        value: "{{answer}}",
        tolerance: 0,
        unit: null,
      },
      explanationPattern: "代入答案检查等号两边。",
      variantSpec: {
        variables: { coefficient: [2], offset: [3], right: [11], answer: [5] },
      },
    })],
    expected: "incorrect_equation_answer",
  },
  {
    name: "nonlinear equations that mimic an affine expression at three sample points",
    catalog: [validTemplate({
      answerMode: "equation",
      stemPattern: "解方程：x - x(x - 1)(x - 2) = 0。",
      answerSpecPattern: { kind: "number", value: 0, tolerance: 0, unit: null },
      explanationPattern: "先判断方程是否只有一个解。",
      variantSpec: { variables: {} },
    })],
    expected: "unsolvable_equation",
  },
  {
    name: "content without owned original provenance",
    catalog: [{
      ...validTemplate(),
      source: "adapted",
      licenseStatus: "unknown",
    }],
    expected: "invalid_template",
  },
])("rejects $name", ({ catalog, expected }) => {
  expect(validateCatalog(catalog)).toEqual(expect.arrayContaining([
    expect.stringContaining(expected),
  ]));
});

test("rejects undeclared fields from the strict reviewed-template contract", () => {
  const template = { ...validTemplate(), reviewerNote: "not part of the contract" };

  expect(validateCatalog([template])).toEqual(expect.arrayContaining([
    expect.stringContaining("invalid_template"),
  ]));
});
