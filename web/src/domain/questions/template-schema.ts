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

class ArithmeticParser {
  private index = 0;

  constructor(private readonly expression: string, private readonly x: number) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.index !== this.expression.length) throw new Error("Unsupported equation token");
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      const operator = this.expression[this.index];
      if (operator !== "+" && operator !== "-") return value;
      this.index += 1;
      const next = this.parseTerm();
      value = operator === "+" ? value + next : value - next;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (true) {
      this.skipSpaces();
      const operator = this.expression[this.index];
      if (operator === "*" || operator === "/") {
        this.index += 1;
        const next = this.parseFactor();
        value = operator === "*" ? value * next : value / next;
        continue;
      }
      if (operator === "x" || operator === "X" || operator === "(" || /[0-9.]/.test(operator ?? "")) {
        value *= this.parseFactor();
        continue;
      }
      return value;
    }
  }

  private parseFactor(): number {
    this.skipSpaces();
    const character = this.expression[this.index];
    if (character === "+" || character === "-") {
      this.index += 1;
      const value = this.parseFactor();
      return character === "-" ? -value : value;
    }
    if (character === "x" || character === "X") {
      this.index += 1;
      return this.x;
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
    return Number(match[0]);
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
    const difference = (x: number) => (
      new ArithmeticParser(sides[0], x).parse() - new ArithmeticParser(sides[1], x).parse()
    );
    const atZero = difference(0);
    const atOne = difference(1);
    const atTwo = difference(2);
    if (![atZero, atOne, atTwo].every(Number.isFinite)) return "unsolvable_equation";

    const slope = atOne - atZero;
    const secondDifference = (atTwo - atOne) - slope;
    if (Math.abs(secondDifference) > 1e-8 || Math.abs(slope) < 1e-12) {
      return "unsolvable_equation";
    }

    const solution = -atZero / slope;
    const acceptedDifference = Math.max(answer.tolerance, 1e-8);
    return Math.abs(solution - answer.value) <= acceptedDifference
      ? null
      : "incorrect_equation_answer";
  } catch {
    return "unsolvable_equation";
  }
}

const asksForUnit = /写(?:出|上)?单位|带(?:上)?单位|标明单位|注明单位|(?:多少|几)(?:元|角|分|毫米|厘米|千米|米|平方厘米|平方米|立方厘米|升|毫升|克|千克|吨|小时|分钟|秒|度|人|个|本|支|盒|张|包|辆|页)/;

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

    if (asksForUnit.test(instance.stem)
      && instance.answerSpec.kind === "number" && !instance.answerSpec.unit?.trim()) {
      errors.push(`${template.id}:missing_unit:variant-${index}`);
    }
    if (instance.answerSpec.kind === "number" && instance.answerSpec.unit
      && !instance.stem.includes(instance.answerSpec.unit)) {
      errors.push(`${template.id}:unit_mismatch:variant-${index}`);
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
