import type { ErrorCause } from "@/domain/learning/contracts";
import type { AnswerSpec } from "@/domain/questions/answer-spec";

export type ErrorCategory = "habit" | "knowledge" | "unknown";

export type ErrorClassificationInput = {
  answerSpec: AnswerSpec;
  stem?: string;
  structureTag?: string;
  commonErrors?: readonly ErrorCause[];
  incompleteReadingTargets?: readonly string[];
};

const categoryByCause: Record<ErrorCause, ErrorCategory> = {
  missing_unit: "habit",
  copied_number: "habit",
  calculation: "habit",
  relationship: "knowledge",
  range_check: "habit",
  incomplete_reading: "habit",
  unknown: "unknown",
};

export function errorCategory(cause: ErrorCause): ErrorCategory {
  return categoryByCause[cause];
}

function normalizeText(value: string): string {
  return value.trim().replace(/[０-９．＋－]/g, (character) => {
    if (character === "．") return ".";
    if (character === "＋") return "+";
    if (character === "－") return "-";
    return String(character.charCodeAt(0) - 0xfee0);
  }).replace(/[\s\u3000]+/g, " ");
}

function parseWrittenNumber(value: string): { number: number; suffix: string } | null {
  const match = normalizeText(value).match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(.*)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return { number, suffix: match[2].trim() };
}

function isCorrectNumber(actual: number, spec: Extract<AnswerSpec, { kind: "number" }>): boolean {
  return Math.abs(actual - spec.value) <= spec.tolerance;
}

function isTenfoldAnomaly(actual: number, expected: number): boolean {
  if (expected === 0) return false;
  const epsilon = Math.max(Math.abs(expected) * 1e-9, 1e-9);
  return Math.abs(actual - expected * 10) <= epsilon
    || Math.abs(actual - expected * 0.1) <= epsilon;
}

function numbersFromStem(stem: string): number[] {
  return [...normalizeText(stem).matchAll(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/g)]
    .map((match) => Number(match[0]))
    .filter(Number.isFinite);
}

export function classifyError(input: ErrorClassificationInput, writtenAnswer: string): ErrorCause {
  const normalized = normalizeText(writtenAnswer);
  const commonErrors = new Set(input.commonErrors ?? []);

  if (input.answerSpec.kind === "choice") {
    if (normalized === input.answerSpec.value) return "unknown";
    if (commonErrors.has("incomplete_reading")
      && ["A", "B", "C", "D"].includes(normalized)
      && input.incompleteReadingTargets?.includes(normalized)) return "incomplete_reading";
    return "unknown";
  }

  const parsed = parseWrittenNumber(normalized);
  if (!parsed) return "unknown";

  if (input.answerSpec.unit !== null && parsed.suffix !== input.answerSpec.unit) {
    return "missing_unit";
  }
  if (input.answerSpec.unit === null && parsed.suffix !== "") return "unknown";
  if (isCorrectNumber(parsed.number, input.answerSpec)) return "unknown";
  if (isTenfoldAnomaly(parsed.number, input.answerSpec.value)) return "range_check";

  const equationLike = input.structureTag?.toLowerCase().includes("equation")
    || /(?:^|[^a-z])x(?:[^a-z]|$)/i.test(input.stem ?? "");
  if (equationLike) return "relationship";

  if (commonErrors.has("copied_number")
    && numbersFromStem(input.stem ?? "").some((value) => value === parsed.number)) {
    return "copied_number";
  }
  if (commonErrors.has("calculation")) return "calculation";
  if (commonErrors.has("incomplete_reading")
    && input.incompleteReadingTargets?.includes(normalized)) return "incomplete_reading";
  return "unknown";
}
