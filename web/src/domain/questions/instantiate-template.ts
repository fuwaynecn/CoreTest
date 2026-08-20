import { createHash } from "node:crypto";
import { answerSpecSchema, type AnswerSpec } from "./answer-spec";
import type { ReviewedTemplate } from "./template-schema";

type VariantValue = string | number;

export type QuestionInstance = {
  templateId: string;
  skillCode: string;
  domain: ReviewedTemplate["domain"];
  contentTier: ReviewedTemplate["contentTier"];
  difficulty: ReviewedTemplate["difficulty"];
  structureTag: string;
  estimatedSeconds: number;
  readingLoad: ReviewedTemplate["readingLoad"];
  answerMode: ReviewedTemplate["answerMode"];
  stem: string;
  answerSpec: AnswerSpec;
  explanation: string;
  commonErrors: ReviewedTemplate["commonErrors"];
  hintLadder: [string, string, string];
  readingCard: boolean;
  source: "original";
  licenseStatus: "owned";
  variantSeed: string;
  variables: Record<string, VariantValue>;
};

const exactPlaceholder = /^\{\{([a-z][a-z0-9_]*)\}\}$/i;
const placeholder = /\{\{([a-z][a-z0-9_]*)\}\}/gi;

function gcd(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

export function variantPeriod(template: ReviewedTemplate): number {
  return Object.values(template.variantSpec.variables).reduce(
    (period, values) => values.length === 0 ? 0 : (period * values.length) / gcd(period, values.length),
    1,
  );
}

function selectVariables(template: ReviewedTemplate, index: number): Record<string, VariantValue> {
  return Object.fromEntries(Object.entries(template.variantSpec.variables).map(([name, values]) => {
    if (values.length === 0) throw new Error(`Variable ${name} has no allowed values`);
    return [name, values[index % values.length]];
  }));
}

function renderPattern(value: unknown, variables: Record<string, VariantValue>): unknown {
  if (typeof value === "string") {
    const exact = value.match(exactPlaceholder);
    if (exact) {
      const replacement = variables[exact[1]];
      if (replacement === undefined) throw new Error(`Unsupported placeholder: ${exact[1]}`);
      return replacement;
    }

    return value.replace(placeholder, (_, name: string) => {
      const replacement = variables[name];
      if (replacement === undefined) throw new Error(`Unsupported placeholder: ${name}`);
      return String(replacement);
    });
  }
  if (Array.isArray(value)) return value.map((item) => renderPattern(item, variables));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => (
      [key, renderPattern(item, variables)]
    )));
  }
  return value;
}

export function instantiateTemplateAtIndex(
  template: ReviewedTemplate,
  index: number,
  variantSeed: string,
): QuestionInstance {
  const variables = selectVariables(template, index);
  const stem = renderPattern(template.stemPattern, variables);
  const explanation = renderPattern(template.explanationPattern, variables);
  const answerSpec = answerSpecSchema.parse(renderPattern(template.answerSpecPattern, variables));
  const hintLadder = template.hintLadder.map((hint) => renderPattern(hint, variables));

  if (typeof stem !== "string" || typeof explanation !== "string"
    || hintLadder.some((hint) => typeof hint !== "string")) {
    throw new Error(`Template ${template.id} rendered a non-text question field`);
  }

  return {
    templateId: template.id,
    skillCode: template.skillCode,
    domain: template.domain,
    contentTier: template.contentTier,
    difficulty: template.difficulty,
    structureTag: template.structureTag,
    estimatedSeconds: template.estimatedSeconds,
    readingLoad: template.readingLoad,
    answerMode: template.answerMode,
    stem,
    answerSpec,
    explanation,
    commonErrors: template.commonErrors,
    hintLadder: hintLadder as [string, string, string],
    readingCard: template.readingCard,
    source: template.source,
    licenseStatus: template.licenseStatus,
    variantSeed,
    variables,
  };
}

export function instantiateTemplate(template: ReviewedTemplate, seed: string): QuestionInstance {
  const period = variantPeriod(template);
  if (period <= 0) throw new Error(`Template ${template.id} has no valid variant period`);

  const index = createHash("sha256")
    .update(`${template.id}\0${seed}`)
    .digest()
    .readUInt32BE(0) % period;
  return instantiateTemplateAtIndex(template, index, seed);
}
