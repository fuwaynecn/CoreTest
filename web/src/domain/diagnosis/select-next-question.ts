import type { LearningDomain } from "@/domain/learning/contracts";
import type {
  DiagnosticAnswer,
  DiagnosticSelection,
  DiagnosticSelectionInput,
  Difficulty,
} from "./types";

type DifficultyEvidence = Pick<DiagnosticAnswer, "correct" | "independent" | "difficulty">;

const partDomainRotations = {
  1: ["number_operations"],
  2: ["equation_algebra", "application_modeling", "thinking_habits"],
  3: ["geometry_space", "data_statistics", "application_modeling", "thinking_habits"],
} as const satisfies Record<DiagnosticSelectionInput["partNumber"], readonly LearningDomain[]>;

function clampDifficulty(value: number): Difficulty {
  return Math.max(1, Math.min(4, value)) as Difficulty;
}

export function nextDifficulty(answers: readonly DifficultyEvidence[]): Difficulty {
  if (answers.length === 0) return 2;

  const latest = answers.at(-1)!;
  if (!latest.correct) return clampDifficulty(latest.difficulty - 1);

  const previous = answers.at(-2);
  if (latest.independent && previous?.correct && previous.independent) {
    return clampDifficulty(latest.difficulty + 1);
  }

  return latest.difficulty;
}

function selectionReason(answers: readonly DifficultyEvidence[]): DiagnosticSelection["reason"] {
  if (answers.length === 0) return "part_anchor";

  const latest = answers.at(-1)!;
  if (!latest.correct) return "lower_after_error";

  const previous = answers.at(-2);
  if (latest.independent && previous?.correct && previous.independent) return "raise_after_two";
  return "hold_level";
}

export function selectNextDiagnosticQuestion(
  input: DiagnosticSelectionInput,
): DiagnosticSelection | null {
  const rotation = partDomainRotations[input.partNumber];
  const slotIndex = input.answers.length % 15;
  const targetDomain = rotation[slotIndex % rotation.length];
  const domainEvidence = input.answers.filter((answer) => answer.domain === targetDomain);
  const targetDifficulty = nextDifficulty(domainEvidence);
  const usedTemplateIds = new Set(input.answers.map((answer) => answer.templateId));
  const skillEvidenceCounts = new Map<string, number>();

  for (const answer of input.answers) {
    skillEvidenceCounts.set(answer.skillId, (skillEvidenceCounts.get(answer.skillId) ?? 0) + 1);
  }

  const candidate = input.catalog
    .filter((template) => template.domain === targetDomain && !usedTemplateIds.has(template.templateId))
    .toSorted((left, right) => (
      Math.abs(left.difficulty - targetDifficulty) - Math.abs(right.difficulty - targetDifficulty)
      || (skillEvidenceCounts.get(left.skillId) ?? 0) - (skillEvidenceCounts.get(right.skillId) ?? 0)
      || left.templateId.localeCompare(right.templateId)
    ))[0];

  if (!candidate) return null;

  return {
    templateId: candidate.templateId,
    difficulty: candidate.difficulty,
    reason: selectionReason(domainEvidence),
    variantSeed: `${input.runSeed}:part-${input.partNumber}:slot-${slotIndex + 1}:${candidate.templateId}`,
  };
}
