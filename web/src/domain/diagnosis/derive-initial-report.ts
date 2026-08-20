import { learningDomains, type LearningDomain } from "@/domain/learning/contracts";
import type {
  DiagnosticAnswer,
  InitialDiagnosisReport,
  InitialDiagnosisResult,
  InitialDiagnosisStatus,
} from "./types";

function summarize(evidence: readonly DiagnosticAnswer[]): InitialDiagnosisResult {
  const totalWeight = evidence.reduce((total, item) => total + item.difficulty, 0);
  const independentCorrectWeight = evidence.reduce(
    (total, item) => total + (item.correct && item.independent ? item.difficulty : 0),
    0,
  );
  const weightedRate = totalWeight === 0 ? 0 : (independentCorrectWeight / totalWeight) * 100;
  const distinctIndependentCorrectTemplates = new Set(
    evidence
      .filter((item) => item.correct && item.independent)
      .map((item) => item.templateId),
  ).size;

  let status: InitialDiagnosisStatus = "needs_support";
  if (weightedRate >= 80 && distinctIndependentCorrectTemplates >= 2) status = "basic";
  else if (weightedRate >= 50) status = "learning";

  return {
    status,
    weightedRate: Number(weightedRate.toFixed(2)),
    evidenceCount: evidence.length,
    distinctIndependentCorrectTemplates,
  };
}

export function deriveInitialReport(evidence: readonly DiagnosticAnswer[]): InitialDiagnosisReport {
  const skillGroups = new Map<string, DiagnosticAnswer[]>();
  for (const item of evidence) {
    const group = skillGroups.get(item.skillId) ?? [];
    group.push(item);
    skillGroups.set(item.skillId, group);
  }

  const skills = [...skillGroups.entries()]
    .map(([skillId, items]) => ({
      skillId,
      domain: items[0].domain,
      ...summarize(items),
    }))
    .sort((left, right) => left.skillId.localeCompare(right.skillId));

  const domains = learningDomains.flatMap((domain: LearningDomain) => {
    const items = evidence.filter((item) => item.domain === domain);
    return items.length === 0 ? [] : [{ domain, ...summarize(items) }];
  });

  return { skills, domains };
}
