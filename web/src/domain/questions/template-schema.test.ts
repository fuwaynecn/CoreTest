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
