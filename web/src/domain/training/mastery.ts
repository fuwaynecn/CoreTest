export type MasteryStatus = "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
export type MasteryEvidenceInput = {
  purpose: "diagnostic" | "learning" | "review" | "assessment";
  templateId: string;
  structureTag: string;
  difficulty: 1 | 2 | 3 | 4;
  firstAttemptCorrect: boolean;
  independent: boolean;
  occurredOn: string;
  reviewIntervalDays: 0 | 1 | 3 | 7 | 14 | 30;
};
export type MasteryState = {
  status: MasteryStatus;
  evidenceCount: number;
  firstAttemptCorrectCount: number;
  independentCorrectCount: number;
  reasonCode: string;
};

function initialDiagnosticState(evidence: MasteryEvidenceInput[], currentStatus: MasteryStatus) {
  const diagnostic = evidence.filter((row) => row.purpose === "diagnostic");
  if (diagnostic.length === 0) return {
    status: currentStatus,
    reasonCode: currentStatus === "undiagnosed"
      ? "no_diagnostic_evidence" : "preserved_status_without_diagnostic_telemetry",
  };
  const totalWeight = diagnostic.reduce((sum, row) => sum + row.difficulty, 0);
  const correctWeight = diagnostic.reduce((sum, row) => (
    sum + (row.firstAttemptCorrect && row.independent ? row.difficulty : 0)
  ), 0);
  const weightedRate = totalWeight === 0 ? 0 : correctWeight * 100 / totalWeight;
  const distinctCorrectTemplates = new Set(diagnostic
    .filter((row) => row.firstAttemptCorrect && row.independent)
    .map((row) => row.templateId)).size;
  if (weightedRate >= 80 && distinctCorrectTemplates >= 2) {
    return { status: "basic" as const, reasonCode: "diagnostic_basic" };
  }
  if (weightedRate >= 50) return { status: "learning" as const, reasonCode: "diagnostic_learning" };
  return { status: "needs_support" as const, reasonCode: "diagnostic_needs_support" };
}

export function deriveMasteryState(
  evidence: MasteryEvidenceInput[],
  currentStatus: MasteryStatus = "undiagnosed",
): MasteryState {
  const evidenceCount = evidence.length;
  const firstAttemptCorrectCount = evidence.filter((row) => row.firstAttemptCorrect).length;
  const independentCorrectCount = evidence.filter((row) => row.firstAttemptCorrect && row.independent).length;
  if (evidenceCount === 0) return {
    status: "undiagnosed", evidenceCount, firstAttemptCorrectCount,
    independentCorrectCount, reasonCode: "no_evidence",
  };

  const initial = initialDiagnosticState(evidence, currentStatus);
  let status: MasteryStatus = initial.status;
  let reasonCode = initial.reasonCode;
  if (status === "undiagnosed") {
    return { status, evidenceCount, firstAttemptCorrectCount, independentCorrectCount, reasonCode };
  }

  const processed: MasteryEvidenceInput[] = [];
  const failedDueReviews: MasteryEvidenceInput[] = [];
  let promotionStart = 0;
  for (const row of evidence.filter((item) => item.purpose !== "diagnostic")) {
    const dueReview = row.purpose === "review" && row.reviewIntervalDays > 0;
    if (dueReview && !row.firstAttemptCorrect) {
      failedDueReviews.push(row);
      const latestTwo = failedDueReviews.slice(-2);
      if (latestTwo.length === 2 && latestTwo[0].occurredOn !== latestTwo[1].occurredOn) {
        status = "needs_support";
        reasonCode = "two_day_failed_due_reviews";
        promotionStart = processed.length + 1;
      } else if (status === "stable") {
        status = "basic";
        reasonCode = "failed_due_review_stable_to_basic";
        promotionStart = processed.length + 1;
      } else if (status === "basic") {
        status = "learning";
        reasonCode = "failed_due_review_basic_to_learning";
        promotionStart = processed.length + 1;
      }
      processed.push(row);
      continue;
    }
    if (dueReview) failedDueReviews.length = 0;
    processed.push(row);

    if (status === "needs_support") {
      const correctDays = new Set(processed.slice(promotionStart)
        .filter((item) => item.firstAttemptCorrect && item.independent)
        .map((item) => item.occurredOn));
      if (correctDays.size >= 2) {
        status = "learning";
        reasonCode = "support_two_day_independent_correct";
      }
    }
    if (status === "learning") {
      const recent = processed.slice(promotionStart).slice(-5);
      const correct = recent.filter((item) => item.firstAttemptCorrect).length;
      if (recent.length === 5 && correct >= 4
        && new Set(recent.map((item) => item.occurredOn)).size >= 2
        && new Set(recent.map((item) => item.templateId)).size >= 2
        && recent.every((item) => item.independent)) {
        status = "basic";
        reasonCode = "learning_recent_five_basic";
      }
    }
    if (status === "basic" && dueReview && row.reviewIntervalDays >= 7
      && row.firstAttemptCorrect && row.independent) {
      const hasDifferentCorrectStructure = evidence.some((item) => item !== row
        && item.firstAttemptCorrect && item.independent && item.structureTag !== row.structureTag);
      if (hasDifferentCorrectStructure) {
        status = "stable";
        reasonCode = "basic_due_review_stable";
      }
    }
  }
  return { status, evidenceCount, firstAttemptCorrectCount, independentCorrectCount, reasonCode };
}
