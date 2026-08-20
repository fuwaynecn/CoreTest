import { z } from "zod";
import {
  learningDomains,
  type ContentTier,
  type ErrorCause,
  type LearningDomain,
} from "@/domain/learning/contracts";
import { renderedQuestionErrors } from "./formal-template-validation";
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
  errorTargets?: { incompleteReading: Array<"A" | "B" | "C" | "D"> };
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
  errorTargets: z.strictObject({
    incompleteReading: z.array(z.enum(["A", "B", "C", "D"])).min(1)
      .refine((targets) => new Set(targets).size === targets.length),
  }).optional(),
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

    if (template.errorTargets) {
      if (!template.commonErrors.includes("incomplete_reading")) {
        errors.push(`${template.id}:error_targets_without_cause:variant-${index}`);
      } else if (instance.answerSpec.kind !== "choice") {
        errors.push(`${template.id}:error_targets_require_choice:variant-${index}`);
      } else if (template.errorTargets.incompleteReading.includes(instance.answerSpec.value)) {
        errors.push(`${template.id}:error_target_matches_answer:variant-${index}`);
      }
    }

    errors.push(...renderedQuestionErrors({
      answerMode: template.answerMode,
      stem: instance.stem,
      answerSpec: instance.answerSpec,
    }).map((issue) => `${template.id}:${issue}:variant-${index}`));
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
