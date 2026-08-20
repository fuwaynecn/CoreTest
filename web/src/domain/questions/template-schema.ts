import { z } from "zod";
import {
  learningDomains,
  type ContentTier,
  type ErrorCause,
  type LearningDomain,
} from "@/domain/learning/contracts";
import { instantiateTemplateAtIndex, variantPeriod } from "./instantiate-template";

type VariantValue = string | number;

export type ReviewedTemplate = {
  id: string;
  skillCode: string;
  domain: LearningDomain;
  contentTier: ContentTier;
  difficulty: 1 | 2 | 3 | 4;
  structureTag: string;
  estimatedSeconds: number;
  readingLoad: "short" | "medium" | "long";
  answerMode: "mental" | "written" | "choice" | "fill" | "expression" | "equation";
  stemPattern: string;
  answerSpecPattern: unknown;
  explanationPattern: string;
  commonErrors: ErrorCause[];
  hintLadder: [string, string, string];
  readingCard: boolean;
  source: "original";
  licenseStatus: "owned";
  variantSpec: { variables: Record<string, readonly VariantValue[]> };
};

const errorCauses = [
  "missing_unit", "copied_number", "calculation", "relationship",
  "range_check", "incomplete_reading", "unknown",
] as const satisfies readonly ErrorCause[];

export const reviewedTemplateSchema: z.ZodType<ReviewedTemplate> = z.strictObject({
  id: z.string().trim().min(1),
  skillCode: z.string().trim().min(1),
  domain: z.enum(learningDomains),
  contentTier: z.enum(["core", "regional", "transition"]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  structureTag: z.string().trim().min(1),
  estimatedSeconds: z.number().int().positive(),
  readingLoad: z.enum(["short", "medium", "long"]),
  answerMode: z.enum(["mental", "written", "choice", "fill", "expression", "equation"]),
  stemPattern: z.string().trim().min(1),
  answerSpecPattern: z.unknown(),
  explanationPattern: z.string().trim().min(1),
  commonErrors: z.array(z.enum(errorCauses)).min(1),
  hintLadder: z.tuple([
    z.string().trim().min(1),
    z.string().trim().min(1),
    z.string().trim().min(1),
  ]),
  readingCard: z.boolean(),
  source: z.literal("original"),
  licenseStatus: z.literal("owned"),
  variantSpec: z.strictObject({
    variables: z.record(
      z.string().regex(/^[a-z][a-z0-9_]*$/i),
      z.array(z.union([z.string(), z.number().finite()])),
    ),
  }),
});

type TemplateRecord = Record<string, unknown>;

function templateId(value: unknown, index: number): string {
  if (value !== null && typeof value === "object" && typeof (value as TemplateRecord).id === "string") {
    return (value as TemplateRecord).id as string;
  }
  return `catalog[${index}]`;
}

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

function placeholderErrors(template: ReviewedTemplate): string[] {
  const errors: string[] = [];
  const allowed = new Set(Object.keys(template.variantSpec.variables));
  const patterns = [
    template.stemPattern,
    template.answerSpecPattern,
    template.explanationPattern,
    template.hintLadder,
  ];

  for (const text of patterns.flatMap(stringsIn)) {
    const tokens = text.matchAll(/\{\{([^{}]*)\}\}/g);
    for (const token of tokens) {
      const name = token[1];
      if (!/^[a-z][a-z0-9_]*$/i.test(name) || !allowed.has(name)) {
        errors.push(`${template.id}:unsupported_placeholder:${name}`);
      }
    }
    const unmatched = text.replace(/\{\{[^{}]*\}\}/g, "");
    if (unmatched.includes("{{") || unmatched.includes("}}")) {
      errors.push(`${template.id}:unsupported_placeholder:malformed`);
    }
  }
  return errors;
}

type AffineValue = { constant: number; coefficient: number; hasVariable: boolean };

function addAffine(left: AffineValue, right: AffineValue): AffineValue {
  return {
    constant: left.constant + right.constant,
    coefficient: left.coefficient + right.coefficient,
    hasVariable: left.hasVariable || right.hasVariable,
  };
}

function scaleAffine(value: AffineValue, factor: number): AffineValue {
  return {
    constant: value.constant * factor,
    coefficient: value.coefficient * factor,
    hasVariable: value.hasVariable,
  };
}

function multiplyAffine(left: AffineValue, right: AffineValue): AffineValue {
  if (left.hasVariable && right.hasVariable) {
    throw new Error("Nonlinear equation term");
  }
  return {
    constant: left.constant * right.constant,
    coefficient: left.coefficient * right.constant + left.constant * right.coefficient,
    hasVariable: left.hasVariable || right.hasVariable,
  };
}

function divideAffine(left: AffineValue, right: AffineValue): AffineValue {
  if (right.hasVariable || right.constant === 0) {
    throw new Error("Equation division must use a non-zero constant");
  }
  return scaleAffine(left, 1 / right.constant);
}

class AffineParser {
  private index = 0;

  constructor(private readonly expression: string) {}

  parse(): AffineValue {
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.index !== this.expression.length) throw new Error("Unsupported equation token");
    return value;
  }

  private parseExpression(): AffineValue {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      const operator = this.expression[this.index];
      if (operator !== "+" && operator !== "-") return value;
      this.index += 1;
      const next = this.parseTerm();
      value = addAffine(value, operator === "+" ? next : scaleAffine(next, -1));
    }
  }

  private parseTerm(): AffineValue {
    let value = this.parseFactor();
    while (true) {
      this.skipSpaces();
      const operator = this.expression[this.index];
      if (operator === "*" || operator === "/") {
        this.index += 1;
        const next = this.parseFactor();
        value = operator === "*"
          ? multiplyAffine(value, next)
          : divideAffine(value, next);
        continue;
      }
      if (operator === "x" || operator === "X" || operator === "(" || /[0-9.]/.test(operator ?? "")) {
        value = multiplyAffine(value, this.parseFactor());
        continue;
      }
      return value;
    }
  }

  private parseFactor(): AffineValue {
    this.skipSpaces();
    const character = this.expression[this.index];
    if (character === "+" || character === "-") {
      this.index += 1;
      const value = this.parseFactor();
      return character === "-" ? scaleAffine(value, -1) : value;
    }
    if (character === "x" || character === "X") {
      this.index += 1;
      return { constant: 0, coefficient: 1, hasVariable: true };
    }
    if (character === "(") {
      this.index += 1;
      const value = this.parseExpression();
      this.skipSpaces();
      if (this.expression[this.index] !== ")") throw new Error("Unclosed equation group");
      this.index += 1;
      return value;
    }

    const match = this.expression.slice(this.index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
    if (!match) throw new Error("Expected equation value");
    this.index += match[0].length;
    return { constant: Number(match[0]), coefficient: 0, hasVariable: false };
  }

  private skipSpaces() {
    while (/\s/.test(this.expression[this.index] ?? "")) this.index += 1;
  }
}

function equationSides(stem: string): [string, string] | null {
  const normalized = stem.replaceAll("×", "*").replaceAll("÷", "/")
    .replaceAll("（", "(").replaceAll("）", ")").replaceAll("−", "-");
  const equals = normalized.indexOf("=");
  if (equals < 0) return null;
  const allowed = /[0-9xX+\-*/().\s]/;
  let start = equals - 1;
  while (start >= 0 && allowed.test(normalized[start])) start -= 1;
  let end = equals + 1;
  while (end < normalized.length && allowed.test(normalized[end])) end += 1;
  const left = normalized.slice(start + 1, equals).trim();
  const right = normalized.slice(equals + 1, end).trim();
  return left && right ? [left, right] : null;
}

function equationError(stem: string, answer: { value: number; tolerance: number }): string | null {
  const sides = equationSides(stem);
  if (!sides) return "unsolvable_equation";

  try {
    const left = new AffineParser(sides[0]).parse();
    const right = new AffineParser(sides[1]).parse();
    const difference = addAffine(left, scaleAffine(right, -1));
    if (![difference.constant, difference.coefficient].every(Number.isFinite)
      || Math.abs(difference.coefficient) < 1e-12) return "unsolvable_equation";

    const solution = -difference.constant / difference.coefficient;
    const acceptedDifference = Math.max(answer.tolerance, 1e-8);
    return Math.abs(solution - answer.value) <= acceptedDifference
      ? null
      : "incorrect_equation_answer";
  } catch {
    return "unsolvable_equation";
  }
}

const asksToWriteUnit = /写(?:出|上)?单位|带(?:上)?单位|标明单位|注明单位/;

function requestedAnswerUnit(stem: string): string | null {
  const matches = [...stem.matchAll(
    /(?:多少|几)\s*(平方厘米|平方米|立方厘米|毫米|厘米|千米|毫升|千克|分钟|小时|元|角|分|米|升|克|吨|秒|度|人|个|本|支|盒|张|包|辆|页)(?=[？?。；，,\s]|$)/g,
  )];
  return matches.at(-1)?.[1] ?? null;
}

type VariantVariables = Record<string, string | number>;
type NumberValidator = (variables: VariantVariables) => number;

function numberVariable(variables: VariantVariables, name: string): number {
  const value = variables[name];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Variable ${name} is not numeric`);
  return parsed;
}

function arithmeticValue(expression: string): number {
  const normalized = expression.replaceAll("×", "*").replaceAll("÷", "/")
    .replaceAll("（", "(").replaceAll("）", ")").replaceAll("−", "-");
  const value = new AffineParser(normalized).parse();
  if (value.hasVariable || !Number.isFinite(value.constant)) {
    throw new Error("Expected a finite numeric expression");
  }
  return value.constant;
}

function expressionVariable(variables: VariantVariables, name: string): number {
  const value = variables[name];
  if (value === undefined) throw new Error(`Variable ${name} is missing`);
  return arithmeticValue(String(value));
}

const numberValidators: Record<string, NumberValidator> = {
  "mental-sum": (v) => numberVariable(v, "left") + numberVariable(v, "right"),
  "mental-difference": (v) => numberVariable(v, "left") - numberVariable(v, "right"),
  "decimal-add": (v) => numberVariable(v, "left") + numberVariable(v, "right"),
  "decimal-subtract": (v) => numberVariable(v, "left") - numberVariable(v, "right"),
  "decimal-multiply": (v) => numberVariable(v, "left") * numberVariable(v, "right"),
  "fraction-same-denominator": (v) => expressionVariable(v, "expression"),
  "fraction-unlike-denominator": (v) => expressionVariable(v, "expression"),
  "fraction-of-quantity": (v) => numberVariable(v, "whole") * expressionVariable(v, "fraction"),
  "mixed-order": (v) => expressionVariable(v, "expression"),
  "mixed-parentheses": (v) => expressionVariable(v, "expression"),
  "distributive-law": (v) => expressionVariable(v, "expression"),
  "associative-law": (v) => expressionVariable(v, "expression"),
  "angle-supplement": (v) => 180 - numberVariable(v, "known"),
  "rectangle-perimeter": (v) => 2 * (numberVariable(v, "length") + numberVariable(v, "width")),
  "missing-side-perimeter": (v) => numberVariable(v, "perimeter") / 2 - numberVariable(v, "length"),
  "rectangle-area": (v) => numberVariable(v, "length") * numberVariable(v, "width"),
  "triangle-area": (v) => numberVariable(v, "base") * numberVariable(v, "height") / 2,
  "cuboid-volume": (v) => numberVariable(v, "length") * numberVariable(v, "width") * numberVariable(v, "height"),
  "composite-area": (v) => (
    numberVariable(v, "outerLength") * numberVariable(v, "outerWidth")
    - numberVariable(v, "cutLength") * numberVariable(v, "cutWidth")
  ),
  "table-multi-read": (v) => numberVariable(v, "aAfternoon") + numberVariable(v, "bAfternoon"),
  "bar-compare": (v) => {
    const values = [numberVariable(v, "first"), numberVariable(v, "second"), numberVariable(v, "third")];
    return Math.max(...values) - Math.min(...values);
  },
  "line-change": (v) => numberVariable(v, "wednesday") - numberVariable(v, "monday"),
  average: (v) => {
    const scores = String(v.scores).split(/[、，,]/).map(Number);
    if (scores.length === 0 || scores.some((score) => !Number.isFinite(score))) {
      throw new Error("Average scores are invalid");
    }
    return scores.reduce((total, score) => total + score, 0) / scores.length;
  },
  "unit-price": (v) => numberVariable(v, "price") * numberVariable(v, "count"),
  "price-compare": (v) => Math.abs(
    Math.ceil(numberVariable(v, "target") / numberVariable(v, "aCount")) * numberVariable(v, "aPrice")
    - Math.ceil(numberVariable(v, "target") / numberVariable(v, "bCount")) * numberVariable(v, "bPrice"),
  ),
  "speed-time-distance": (v) => numberVariable(v, "speed") * numberVariable(v, "hours"),
  "distance-multi-leg": (v) => (
    numberVariable(v, "firstSpeed") * numberVariable(v, "firstHours")
    + numberVariable(v, "secondSpeed") * numberVariable(v, "secondHours")
  ),
  "work-rate": (v) => numberVariable(v, "rate") * numberVariable(v, "minutes"),
  "work-together": (v) => (
    (numberVariable(v, "firstRate") + numberVariable(v, "secondRate")) * numberVariable(v, "minutes")
  ),
  "ratio-share": (v) => (
    numberVariable(v, "total") * numberVariable(v, "redPart")
    / (numberVariable(v, "redPart") + numberVariable(v, "bluePart"))
  ),
  "ratio-adjust": (v) => (
    numberVariable(v, "total") * numberVariable(v, "first")
    / (numberVariable(v, "first") + numberVariable(v, "second"))
    - numberVariable(v, "drink")
  ),
  "percent-of": (v) => numberVariable(v, "original") * numberVariable(v, "percent") / 100,
  "percent-two-stage": (v) => (
    numberVariable(v, "total")
    * (1 - (numberVariable(v, "morning") + numberVariable(v, "afternoon")) / 100)
  ),
  "multi-step-plan": (v) => (
    (numberVariable(v, "boxes") * numberVariable(v, "perBox") - numberVariable(v, "first"))
    / numberVariable(v, "classes")
  ),
  "multi-step-reverse": (v) => (
    (numberVariable(v, "remaining") - numberVariable(v, "returned"))
    / (1 - expressionVariable(v, "fraction"))
  ),
  "extra-info-filter": (v) => numberVariable(v, "stories") - numberVariable(v, "borrowed"),
  "extra-info-model": (v) => Math.ceil(
    (numberVariable(v, "students") + numberVariable(v, "teachers")) / numberVariable(v, "capacity"),
  ),
  "unit-conversion": (v) => numberVariable(v, "meters") + numberVariable(v, "centimeters") / 100,
};

function numberConsistencyError(
  structureTag: string,
  variables: VariantVariables,
  answer: { value: number; tolerance: number },
): string | null {
  const validate = numberValidators[structureTag];
  if (!validate) return null;
  try {
    const expected = validate(variables);
    return Math.abs(expected - answer.value) <= Math.max(answer.tolerance, 1e-8)
      ? null
      : "incorrect_number_answer";
  } catch {
    return "invalid_number_pattern";
  }
}

type ChoiceOption = { label: "A" | "B" | "C" | "D"; text: string };

function choiceOptions(stem: string): ChoiceOption[] {
  return [...stem.matchAll(/([ABCD])[.．、]\s*([\s\S]*?)(?=\s+[ABCD][.．、]\s*|$)/g)]
    .map((match) => ({
      label: match[1] as ChoiceOption["label"],
      text: match[2].trim().replace(/[。；;]$/, ""),
    }));
}

type ChoiceValidator = (
  variables: VariantVariables,
  options: ChoiceOption[],
) => ChoiceOption[];

function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

function optionsEqualTo(options: ChoiceOption[], expected: string): ChoiceOption[] {
  const compactExpected = compactText(expected);
  return options.filter(({ text }) => compactText(text) === compactExpected);
}

function numericList(value: string | number): number[] {
  const values = String(value).split(/[、，,]/).map(Number);
  if (values.length === 0 || values.some((item) => !Number.isFinite(item))) {
    throw new Error("Invalid numeric list");
  }
  return values;
}

function rangeContains(range: string | number, value: number): boolean {
  const normalized = compactText(String(range));
  const interval = normalized.match(/^(-?\d+(?:\.\d+)?)到(-?\d+(?:\.\d+)?)$/);
  if (interval) return value >= Number(interval[1]) && value <= Number(interval[2]);
  const below = normalized.match(/^小于(-?\d+(?:\.\d+)?)$/);
  if (below) return value < Number(below[1]);
  const above = normalized.match(/^大于(-?\d+(?:\.\d+)?)$/);
  if (above) return value > Number(above[1]);
  throw new Error("Unsupported estimate range");
}

function equationStatementIsTrue(statement: string | number): boolean {
  const sides = String(statement).split("=");
  return sides.length === 2
    && Math.abs(arithmeticValue(sides[0]) - arithmeticValue(sides[1])) <= 1e-8;
}

function firstNumericOperand(expression: string | number): number {
  const match = String(expression).match(/-?\d+(?:\.\d+)?/);
  if (!match) throw new Error("Expression has no numeric operand");
  return Number(match[0]);
}

const catalogChoiceValidators: Record<string, ChoiceValidator> = {
  "num-estimate-01": (variables, options) => {
    const exact = expressionVariable(variables, "expression");
    const distances = options.map(({ text }) => Math.abs(Number(text) - exact));
    if (distances.some((distance) => !Number.isFinite(distance))) {
      throw new Error("Estimate options must be numeric");
    }
    const closest = Math.min(...distances);
    return options.filter((_, index) => Math.abs(distances[index] - closest) <= 1e-8);
  },
  "num-estimate-02": (variables, options) => {
    const exact = expressionVariable(variables, "expression");
    const claim = numberVariable(variables, "claim");
    const relativeDifference = Math.abs(claim - exact) / Math.max(Math.abs(exact), 1);
    const expected = relativeDifference <= 0.1
      ? "估算合理"
      : claim > exact ? "一定偏大" : "一定偏小";
    return optionsEqualTo(options, expected);
  },
  "num-reverse-check-01": (variables, options) => {
    const target = firstNumericOperand(variables.expression);
    return options.filter(({ text }) => {
      try {
        return Math.abs(arithmeticValue(text) - target) <= 1e-8;
      } catch {
        return false;
      }
    });
  },
  "num-reverse-check-02": (variables, options) => {
    const exact = expressionVariable(variables, "expression");
    const claim = numberVariable(variables, "claim");
    return optionsEqualTo(
      options,
      Math.abs(exact - claim) <= 1e-8 ? "原计算一定正确" : "检查发现原结果有误",
    );
  },
  "eq-l1-balance-02": (variables, options) => (
    optionsEqualTo(options, `两边减 ${variables.addend}`)
  ),
  "eq-l1-balance-03": (variables, options) => (
    optionsEqualTo(options, `x + ${variables.addend} = ${variables.total}`)
  ),
  "eq-l2-add-sub-02": (_variables, options) => optionsEqualTo(options, "应把两数相加"),
  "eq-l3-mul-div-02": (variables, options) => {
    const expected = numberVariable(variables, "total") / numberVariable(variables, "coefficient");
    return options.filter(({ text }) => {
      const right = text.match(/^x\s*=\s*(.+)$/)?.[1];
      if (!right) return false;
      try {
        return Math.abs(arithmeticValue(right) - expected) <= 1e-8;
      } catch {
        return false;
      }
    });
  },
  "eq-l4-two-step-02": (variables, options) => optionsEqualTo(
    options,
    `先两边减 ${variables.offset}，再两边除以 ${variables.coefficient}`,
  ),
  "eq-l5-complex-02": (variables, options) => optionsEqualTo(
    options,
    `${variables.factor}x - ${numberVariable(variables, "factor") * numberVariable(variables, "offset")} = ${variables.right}`,
  ),
  "eq-l6-model-02": (variables, options) => optionsEqualTo(
    options,
    `把 ${variables.claim} 分别代入等号两边`,
  ),
  "geo-spatial-01": (variables, options) => {
    const count = numberVariable(variables, "count");
    const position = numberVariable(variables, "position");
    if (!Number.isInteger(count) || !Number.isInteger(position) || position < 1 || position > count) {
      throw new Error("Invalid cube layout");
    }
    const heights = Array.from({ length: count }, () => 1);
    heights[position - 1] = 2;
    return optionsEqualTo(options, heights.join(","));
  },
  "data-compare-01": (variables, options) => {
    const first = numericList(variables.firstSet);
    const second = numericList(variables.secondSet);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    const firstMatches = mean(first) > mean(second) && spread(first) < spread(second);
    const secondMatches = mean(second) > mean(first) && spread(second) < spread(first);
    const expected = firstMatches ? "甲组" : secondMatches ? "乙组" : "信息不足";
    return optionsEqualTo(options, expected);
  },
  "data-possibility-01": (variables, options) => {
    const counts = [
      numberVariable(variables, "red"),
      numberVariable(variables, "blue"),
      numberVariable(variables, "green"),
    ];
    const maximum = Math.max(...counts);
    const maxima = counts.flatMap((count, index) => count === maximum ? [index] : []);
    const expected = maxima.length === 3 ? "三种一样" : ["红", "蓝", "绿"][maxima[0]];
    return maxima.length === 1 || maxima.length === 3 ? optionsEqualTo(options, expected) : [];
  },
  "habit-question-01": (_variables, options) => optionsEqualTo(options, "总支数"),
  "habit-question-02": (_variables, options) => optionsEqualTo(options, "用两车路程相减"),
  "habit-condition-01": (_variables, options) => optionsEqualTo(options, "本数和单价"),
  "habit-condition-02": (_variables, options) => optionsEqualTo(options, "先由周长求宽"),
  "habit-unit-01": (_variables, options) => optionsEqualTo(options, "米"),
  "habit-estimate-01": (variables, options) => {
    const exact = expressionVariable(variables, "expression");
    return options.filter(({ text }) => rangeContains(text, exact));
  },
  "habit-estimate-02": (variables, options) => {
    const exact = expressionVariable(variables, "expression");
    const claim = numberVariable(variables, "claim");
    const relativeDifference = Math.abs(claim - exact) / Math.max(Math.abs(exact), 1);
    return optionsEqualTo(
      options,
      relativeDifference > 0.5 ? "结果明显偏离合理范围" : "结果合理",
    );
  },
  "habit-check-01": (_variables, options) => (
    optionsEqualTo(options, "用逆运算还原并比较数量级")
  ),
  "habit-check-02": (variables, options) => {
    const claim = numberVariable(variables, "claim");
    const evidenceSupports = rangeContains(variables.range, claim)
      && equationStatementIsTrue(variables.inverse);
    return optionsEqualTo(
      options,
      evidenceSupports ? "两项检查都支持答案" : "证据互相矛盾，需重算",
    );
  },
};

function directArithmeticQuestion(stem: string): number | null {
  const beforeOptions = stem.split(/\s+A[.．、]/, 1)[0];
  const marker = Math.max(beforeOptions.lastIndexOf("口算"), beforeOptions.lastIndexOf("计算"));
  if (marker < 0) return null;
  const candidate = beforeOptions.slice(marker + 2).replace(/^\s*[：:]\s*/, "")
    .match(/^\s*([0-9.()（）+\-*/×÷\s]+?)(?=\s*(?:=\s*[？?]|[。？?]|$))/)?.[1];
  if (!candidate || !/[+\-*/×÷]/.test(candidate)) return null;
  try {
    return arithmeticValue(candidate);
  } catch {
    return null;
  }
}

function choiceError(
  templateId: string,
  structureTag: string,
  variables: VariantVariables,
  stem: string,
  answer: "A" | "B" | "C" | "D",
): string | null {
  const options = choiceOptions(stem);
  if (options.map(({ label }) => label).join("") !== "ABCD") return "invalid_choice_options";

  const normalized = options.map(({ text }) => text.replace(/\s+/g, ""));
  if (new Set(normalized).size !== options.length) return "duplicate_choice_option";

  const validateCatalogChoice = catalogChoiceValidators[templateId];
  if (validateCatalogChoice) {
    try {
      const matches = validateCatalogChoice(variables, options);
      return matches.length === 1 && matches[0].label === answer
        ? null
        : "incorrect_choice_answer";
    } catch {
      return "invalid_choice_pattern";
    }
  }

  const numericOptions = options.map(({ text }) => Number(text));
  if (structureTag === "estimate-range") {
    if (!numericOptions.every(Number.isFinite)) return "invalid_choice_pattern";
    try {
      const exact = expressionVariable(variables, "expression");
      const distances = numericOptions.map((option) => Math.abs(option - exact));
      const closest = Math.min(...distances);
      const matches = options.filter((_, index) => Math.abs(distances[index] - closest) <= 1e-8);
      return matches.length === 1 && matches[0].label === answer
        ? null
        : "incorrect_choice_answer";
    } catch {
      return "invalid_choice_pattern";
    }
  }

  const expected = directArithmeticQuestion(stem);
  if (expected !== null && numericOptions.every(Number.isFinite)) {
    const matches = options.filter((_, index) => Math.abs(numericOptions[index] - expected) <= 1e-8);
    if (matches.length !== 1 || matches[0].label !== answer) return "incorrect_choice_answer";
  }
  return null;
}

function variantErrors(template: ReviewedTemplate): string[] {
  const errors: string[] = [];
  const period = variantPeriod(template);
  for (let index = 0; index < period; index += 1) {
    let instance;
    try {
      instance = instantiateTemplateAtIndex(template, index, `catalog-validation:${index}`);
    } catch {
      errors.push(`${template.id}:invalid_answer_spec:variant-${index}`);
      continue;
    }

    if (stringsIn([
      instance.stem,
      instance.explanation,
      instance.hintLadder,
      instance.answerSpec,
    ]).some((text) => text.includes("{{") || text.includes("}}"))) {
      errors.push(`${template.id}:unsupported_placeholder:rendered-variant-${index}`);
      continue;
    }

    const requestedUnit = requestedAnswerUnit(instance.stem);
    if (instance.answerSpec.kind === "number") {
      if ((asksToWriteUnit.test(instance.stem) || requestedUnit !== null)
        && !instance.answerSpec.unit?.trim()) {
        errors.push(`${template.id}:missing_unit:variant-${index}`);
      } else if (requestedUnit !== null && instance.answerSpec.unit !== requestedUnit) {
        errors.push(`${template.id}:unit_mismatch:variant-${index}`);
      }
    }
    if (template.answerMode !== "equation" && instance.answerSpec.kind === "number") {
      const issue = numberConsistencyError(template.structureTag, instance.variables, instance.answerSpec);
      if (issue) errors.push(`${template.id}:${issue}:variant-${index}`);
    }
    if (instance.answerSpec.kind === "choice") {
      const issue = choiceError(
        template.id,
        template.structureTag,
        instance.variables,
        instance.stem,
        instance.answerSpec.value,
      );
      if (issue) errors.push(`${template.id}:${issue}:variant-${index}`);
    }
    if (template.answerMode === "equation") {
      if (instance.answerSpec.kind !== "number") {
        errors.push(`${template.id}:unsolvable_equation:variant-${index}`);
      } else {
        const issue = equationError(instance.stem, instance.answerSpec);
        if (issue) errors.push(`${template.id}:${issue}:variant-${index}`);
      }
    }
  }
  return errors;
}

export function validateCatalog(catalog: readonly unknown[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  catalog.forEach((candidate, index) => {
    const id = templateId(candidate, index);
    if (seenIds.has(id)) errors.push(`${id}:duplicate_id`);
    seenIds.add(id);

    if (candidate !== null && typeof candidate === "object") {
      const variables = ((candidate as TemplateRecord).variantSpec as TemplateRecord | undefined)?.variables;
      if (variables !== null && typeof variables === "object") {
        for (const [name, values] of Object.entries(variables)) {
          if (Array.isArray(values) && values.length === 0) {
            errors.push(`${id}:empty_variable_range:${name}`);
          }
        }
      }
    }

    const parsed = reviewedTemplateSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(`${id}:invalid_template:${parsed.error.issues[0]?.path.join(".") || "root"}`);
      return;
    }

    errors.push(...placeholderErrors(parsed.data));
    if (errors.some((error) => error.startsWith(`${id}:unsupported_placeholder:`))) return;
    errors.push(...variantErrors(parsed.data));
  });

  return [...new Set(errors)];
}
