import type { AnswerSpec } from "./answer-spec";

export type ScoreResult = { correct: boolean; normalizedAnswer: string };

const decimalPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

function parseDecimal(input: string): number | null {
  if (!decimalPattern.test(input)) return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

export function scoreAnswer(input: string, spec: AnswerSpec): ScoreResult {
  const trimmed = input.trim();

  if (spec.kind === "choice") {
    return { correct: trimmed === spec.value, normalizedAnswer: trimmed };
  }

  const numberInput = spec.unit === null
    ? trimmed
    : trimmed.endsWith(spec.unit)
      ? trimmed.slice(0, -spec.unit.length).trimEnd()
      : null;
  if (numberInput === null) {
    return { correct: false, normalizedAnswer: trimmed };
  }

  const actual = parseDecimal(numberInput);
  if (actual === null) {
    return { correct: false, normalizedAnswer: trimmed };
  }

  const normalizedAnswer = spec.unit === null
    ? String(actual)
    : `${actual} ${spec.unit}`;
  return {
    correct: Math.abs(actual - spec.value) <= spec.tolerance,
    normalizedAnswer,
  };
}
