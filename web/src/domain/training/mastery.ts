type Evidence = { evidenceCount: number; correctCount: number };
type EvidenceResult = Evidence & { status: "needs_support" | "learning" | "basic" };

export function nextMasteryEvidence(current: Evidence, correct: boolean): EvidenceResult {
  const evidenceCount = current.evidenceCount + 1;
  const correctCount = current.correctCount + (correct ? 1 : 0);
  const status = !correct ? "needs_support" : correctCount >= 2 ? "basic" : "learning";
  return { evidenceCount, correctCount, status };
}
