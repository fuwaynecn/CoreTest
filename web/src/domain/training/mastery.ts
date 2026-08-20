export type MasteryStatus = "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
export type MasteryEvidenceInput = {
  id: string;
  purpose: "diagnostic" | "learning" | "review" | "assessment";
  templateId: string;
  structureTag: string;
  difficulty: 1 | 2 | 3 | 4;
  firstAttemptCorrect: boolean;
  independent: boolean;
  hintLevel: 0 | 1 | 2 | 3 | null;
  occurredOn: string;
  occurredAt: number;
  diagnosticRunId: string | null;
  diagnosticCompletedOn: string | null;
  diagnosticCompletedAt: number | null;
  reviewIntervalDays: 0 | 1 | 3 | 7 | 14 | 30;
};
export type MasteryState = {
  status: MasteryStatus;
  evidenceCount: number;
  firstAttemptCorrectCount: number;
  independentCorrectCount: number;
  reasonCode: string;
};

type TimelineEvent = {
  occurredOn: string;
  occurredAt: number;
  id: string;
  rows: MasteryEvidenceInput[];
  diagnostic: boolean;
};

function compareEvents(left: TimelineEvent, right: TimelineEvent) {
  return left.occurredOn.localeCompare(right.occurredOn)
    || left.occurredAt - right.occurredAt
    || left.id.localeCompare(right.id);
}

function timeline(evidence: MasteryEvidenceInput[]): TimelineEvent[] {
  const events: TimelineEvent[] = evidence
    .filter((row) => row.purpose !== "diagnostic")
    .map((row) => ({
      occurredOn: row.occurredOn, occurredAt: row.occurredAt,
      id: row.id, rows: [row], diagnostic: false,
    }));
  const groups = new Map<string, MasteryEvidenceInput[]>();
  for (const row of evidence) {
    if (row.purpose !== "diagnostic" || row.diagnosticRunId === null) continue;
    groups.set(row.diagnosticRunId, [...(groups.get(row.diagnosticRunId) ?? []), row]);
  }
  for (const [runId, rows] of groups) {
    const first = rows[0];
    if (first.diagnosticCompletedOn === null || first.diagnosticCompletedAt === null
      || rows.some((row) => row.diagnosticCompletedOn !== first.diagnosticCompletedOn
        || row.diagnosticCompletedAt !== first.diagnosticCompletedAt
        || row.hintLevel === null
        || (row.independent && row.hintLevel !== 0))) continue;
    events.push({
      occurredOn: first.diagnosticCompletedOn,
      occurredAt: first.diagnosticCompletedAt,
      id: runId,
      rows: rows.toSorted((left, right) => left.occurredOn.localeCompare(right.occurredOn)
        || left.occurredAt - right.occurredAt || left.id.localeCompare(right.id)),
      diagnostic: true,
    });
  }
  return events.sort(compareEvents);
}

function diagnosticState(rows: MasteryEvidenceInput[]) {
  const totalWeight = rows.reduce((sum, row) => sum + row.difficulty, 0);
  const correctWeight = rows.reduce((sum, row) => (
    sum + (row.firstAttemptCorrect && row.independent ? row.difficulty : 0)
  ), 0);
  const weightedRate = totalWeight === 0 ? 0 : correctWeight * 100 / totalWeight;
  const distinctCorrectTemplates = new Set(rows
    .filter((row) => row.firstAttemptCorrect && row.independent)
    .map((row) => row.templateId)).size;
  if (weightedRate >= 80 && distinctCorrectTemplates >= 2) {
    return { status: "basic" as const, reasonCode: "diagnostic_basic" };
  }
  if (weightedRate >= 50) return { status: "learning" as const, reasonCode: "diagnostic_learning" };
  return { status: "needs_support" as const, reasonCode: "diagnostic_needs_support" };
}

function recentFiveState(processed: MasteryEvidenceInput[]) {
  const recent = processed.slice(-5);
  const correct = recent.filter((item) => item.firstAttemptCorrect).length;
  if (recent.length < 5) return { basic: false, reasonCode: "recent_five_insufficient_count" };
  if (correct < 4) return { basic: false, reasonCode: "recent_five_below_basic" };
  if (recent.some((item) => item.hintLevel === null || item.hintLevel >= 2)) {
    return { basic: false, reasonCode: "recent_five_high_or_unknown_hint" };
  }
  if (new Set(recent.map((item) => item.occurredOn)).size < 2) {
    return { basic: false, reasonCode: "recent_five_single_day" };
  }
  if (new Set(recent.map((item) => item.templateId)).size < 2) {
    return { basic: false, reasonCode: "recent_five_single_template" };
  }
  return { basic: true, reasonCode: "learning_recent_five_basic" };
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

  const events = timeline(evidence);
  const hasDiagnostic = evidence.some((row) => row.purpose === "diagnostic");
  const hasUsableDiagnostic = events.some((event) => event.diagnostic);
  let status = currentStatus;
  let reasonCode = hasDiagnostic && !hasUsableDiagnostic
    ? "diagnostic_group_unknown"
    : status === "undiagnosed"
      ? "no_diagnostic_evidence" : "preserved_status_without_diagnostic_telemetry";
  let processed: MasteryEvidenceInput[] = [];
  let failedDueReviews: MasteryEvidenceInput[] = [];

  for (const event of events) {
    if (event.diagnostic) {
      ({ status, reasonCode } = diagnosticState(event.rows));
      processed = [];
      failedDueReviews = [];
      continue;
    }
    if (status === "undiagnosed") continue;
    const row = event.rows[0];
    const dueReview = row.purpose === "review" && row.reviewIntervalDays > 0;
    if (dueReview && !row.firstAttemptCorrect) {
      failedDueReviews.push(row);
      const latestTwo = failedDueReviews.slice(-2);
      if (latestTwo.length === 2 && latestTwo[0].occurredOn !== latestTwo[1].occurredOn) {
        status = "needs_support";
        reasonCode = "two_day_failed_due_reviews";
        processed = [];
      } else if (status === "stable") {
        status = "basic";
        reasonCode = "failed_due_review_stable_to_basic";
        processed = [];
      } else if (status === "basic") {
        status = "learning";
        reasonCode = "failed_due_review_basic_to_learning";
        processed = [];
      } else {
        processed.push(row);
        if (status === "learning") {
          const recent = recentFiveState(processed);
          reasonCode = recent.reasonCode;
          if (recent.basic) status = "basic";
        }
      }
      continue;
    }
    if (dueReview) failedDueReviews = [];
    processed.push(row);

    let promotedFromSupport = false;
    if (status === "needs_support") {
      const correctDays = new Set(processed
        .filter((item) => item.firstAttemptCorrect && item.independent)
        .map((item) => item.occurredOn));
      if (correctDays.size >= 2) {
        status = "learning";
        reasonCode = "support_two_day_independent_correct";
        promotedFromSupport = true;
      }
    }
    if (status === "learning" && !promotedFromSupport) {
      const recent = recentFiveState(processed);
      reasonCode = recent.reasonCode;
      if (recent.basic) status = "basic";
    }
    if (status === "basic" && dueReview && row.reviewIntervalDays >= 7
      && row.firstAttemptCorrect && row.independent) {
      const hasDifferentCorrectStructure = processed.slice(0, -1).some((item) => (
        item.firstAttemptCorrect && item.independent && item.structureTag !== row.structureTag
      ));
      if (hasDifferentCorrectStructure) {
        status = "stable";
        reasonCode = "basic_due_review_stable";
      }
    }
  }
  return { status, evidenceCount, firstAttemptCorrectCount, independentCorrectCount, reasonCode };
}
