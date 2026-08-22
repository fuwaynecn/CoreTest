export type MasteryStatus = "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
export type MasteryReasonCode =
  | "no_evidence"
  | "diagnostic_group_unknown"
  | "no_diagnostic_evidence"
  | "preserved_status_without_diagnostic_telemetry"
  | "diagnostic_needs_support"
  | "diagnostic_learning"
  | "diagnostic_basic"
  | "recent_five_insufficient_count"
  | "recent_five_below_basic"
  | "recent_five_high_or_unknown_hint"
  | "recent_five_single_day"
  | "recent_five_single_template"
  | "support_two_day_independent_correct"
  | "learning_recent_five_basic"
  | "basic_due_review_stable"
  | "failed_due_review_stable_to_basic"
  | "failed_due_review_basic_to_learning"
  | "two_day_failed_due_reviews";

export const masteryReasonDescriptions = {
  no_evidence: "尚未收集到正式首答证据，完成诊断后才会确定起点。",
  diagnostic_group_unknown: "诊断证据缺少完整的提示或完成批次信息，不能据此改写原状态。",
  no_diagnostic_evidence: "已有练习证据，但没有可用诊断起点，因此尚未确定能力状态。",
  preserved_status_without_diagnostic_telemetry: "没有可用的诊断遥测，系统保留原状态并继续等待正式证据。",
  diagnostic_needs_support: "诊断加权独立首答率低于 50%，当前需要示例、订正和更近的复习。",
  diagnostic_learning: "诊断加权独立首答率在 50%–79%，正在形成稳定方法。",
  diagnostic_basic: "诊断加权独立首答率至少 80%，且已有不同模板的独立正确证据。",
  recent_five_insufficient_count: "诊断后还不足 5 次正式首答，暂时保持当前状态。",
  recent_five_below_basic: "最近 5 次首答正确不足 4 次，因此继续学习。",
  recent_five_high_or_unknown_hint: "最近 5 次中出现二级以上或未知提示，暂不升级。",
  recent_five_single_day: "最近 5 次已达到至少 4 次首答正确，但证据还没有跨两个上海自然日。",
  recent_five_single_template: "最近 5 次已达到至少 4 次首答正确，但证据还没有覆盖两个不同模板。",
  support_two_day_independent_correct: "已在两个不同上海自然日独立答对，进入正在学习。",
  learning_recent_five_basic: "最近 5 次首答至少 4 次正确、提示级别均不超过一级，并且跨日、跨模板，进入基础掌握。",
  basic_due_review_stable: "已通过至少 7 天间隔的到期复习，并有不同结构的独立正确证据。",
  failed_due_review_stable_to_basic: "最近一次到期复习首答错误，从稳定保持回到基础掌握。",
  failed_due_review_basic_to_learning: "最近一次到期复习首答错误，从基础掌握回到正在学习。",
  two_day_failed_due_reviews: "两个不同上海自然日的到期复习首答错误，当前需要支持。",
} satisfies Record<MasteryReasonCode, string>;
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
  reasonCode: MasteryReasonCode;
  lastAppliedAt: number | null;
  evidenceCursor: string | null;
  supportingEvidenceIds: string[];
};

type TimelineEvent = {
  occurredOn: string;
  occurredAt: number;
  id: string;
  rows: MasteryEvidenceInput[];
  diagnostic: boolean;
  cursor: string;
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
      id: row.id, rows: [row], diagnostic: false, cursor: row.id,
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
    const orderedRows = rows.toSorted((left, right) => left.occurredOn.localeCompare(right.occurredOn)
      || left.occurredAt - right.occurredAt || left.id.localeCompare(right.id));
    events.push({
      occurredOn: first.diagnosticCompletedOn,
      occurredAt: first.diagnosticCompletedAt,
      id: runId,
      rows: orderedRows,
      diagnostic: true,
      cursor: orderedRows.at(-1)!.id,
    });
  }
  return events.sort(compareEvents);
}

function diagnosticState(rows: MasteryEvidenceInput[]): {
  status: "needs_support" | "learning" | "basic";
  reasonCode: MasteryReasonCode;
} {
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

function latestIndependentCorrectByDate(rows: MasteryEvidenceInput[], count: number) {
  const found: MasteryEvidenceInput[] = [];
  const dates = new Set<string>();
  for (const row of rows.toReversed()) {
    if (!row.firstAttemptCorrect || !row.independent || dates.has(row.occurredOn)) continue;
    found.push(row);
    dates.add(row.occurredOn);
    if (found.length === count) break;
  }
  return found.toReversed().map((row) => row.id);
}

function recentFiveState(processed: MasteryEvidenceInput[]): {
  basic: boolean;
  reasonCode: MasteryReasonCode;
} {
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
    independentCorrectCount, reasonCode: "no_evidence", lastAppliedAt: null, evidenceCursor: null,
    supportingEvidenceIds: [],
  };

  const events = timeline(evidence);
  const hasDiagnostic = evidence.some((row) => row.purpose === "diagnostic");
  const hasUsableDiagnostic = events.some((event) => event.diagnostic);
  let status = currentStatus;
  let reasonCode: MasteryReasonCode = hasDiagnostic && !hasUsableDiagnostic
    ? "diagnostic_group_unknown"
    : status === "undiagnosed"
      ? "no_diagnostic_evidence" : "preserved_status_without_diagnostic_telemetry";
  let processed: MasteryEvidenceInput[] = [];
  let failedDueReviews: MasteryEvidenceInput[] = [];
  let lastAppliedAt: number | null = null;
  let evidenceCursor: string | null = null;
  let supportingEvidenceIds: string[] = hasDiagnostic && !hasUsableDiagnostic
    ? evidence.filter((row) => row.purpose === "diagnostic").map((row) => row.id)
    : !hasDiagnostic ? evidence.map((row) => row.id) : [];

  for (const event of events) {
    if (event.diagnostic) {
      ({ status, reasonCode } = diagnosticState(event.rows));
      lastAppliedAt = event.occurredAt;
      evidenceCursor = event.cursor;
      supportingEvidenceIds = event.rows.map((row) => row.id);
      processed = [];
      failedDueReviews = [];
      continue;
    }
    if (status === "undiagnosed") continue;
    lastAppliedAt = event.occurredAt;
    evidenceCursor = event.cursor;
    const row = event.rows[0];
    const dueReview = row.purpose === "review" && row.reviewIntervalDays > 0;
    if (dueReview && !row.firstAttemptCorrect) {
      failedDueReviews.push(row);
      const latestTwo = failedDueReviews.slice(-2);
      if (latestTwo.length === 2 && latestTwo[0].occurredOn !== latestTwo[1].occurredOn) {
        status = "needs_support";
        reasonCode = "two_day_failed_due_reviews";
        supportingEvidenceIds = latestTwo.map((item) => item.id);
        processed = [];
      } else if (status === "stable") {
        status = "basic";
        reasonCode = "failed_due_review_stable_to_basic";
        supportingEvidenceIds = [row.id];
        processed = [];
      } else if (status === "basic") {
        status = "learning";
        reasonCode = "failed_due_review_basic_to_learning";
        supportingEvidenceIds = [row.id];
        processed = [];
      } else {
        processed.push(row);
        if (status === "learning") {
          const recent = recentFiveState(processed);
          reasonCode = recent.reasonCode;
          supportingEvidenceIds = processed.slice(-5).map((item) => item.id);
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
        supportingEvidenceIds = latestIndependentCorrectByDate(processed, 2);
        promotedFromSupport = true;
      }
    }
    if (status === "learning" && !promotedFromSupport) {
      const recent = recentFiveState(processed);
      reasonCode = recent.reasonCode;
      supportingEvidenceIds = processed.slice(-5).map((item) => item.id);
      if (recent.basic) status = "basic";
    }
    if (status === "basic" && dueReview && row.reviewIntervalDays >= 7
      && row.firstAttemptCorrect && row.independent) {
      const differentCorrectStructure = processed.slice(0, -1).findLast((item) => (
        item.firstAttemptCorrect && item.independent && item.structureTag !== row.structureTag
      ));
      if (differentCorrectStructure) {
        status = "stable";
        reasonCode = "basic_due_review_stable";
        supportingEvidenceIds = [differentCorrectStructure.id, row.id];
      }
    }
  }
  return {
    status, evidenceCount, firstAttemptCorrectCount, independentCorrectCount,
    reasonCode, lastAppliedAt, evidenceCursor, supportingEvidenceIds,
  };
}
