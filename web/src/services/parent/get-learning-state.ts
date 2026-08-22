import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  attempts,
  dosageStates,
  errorObservations,
  masteryEvidence,
  masteryStates,
  reviewSchedules,
  sessionItems,
  skills,
  trainingSessions,
  users,
} from "@/db/schema";
import { errorCategory, type ErrorCategory } from "@/domain/errors/classify-error";
import type { ErrorCause, MasteryStatus } from "@/domain/learning/contracts";
import { compareReviewEvents, reviewEventIdentity } from "@/domain/review/review-event";
import {
  deriveMasteryState,
  masteryReasonDescriptions,
  type MasteryEvidenceInput,
  type MasteryReasonCode,
} from "@/domain/training/mastery";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { firstAttempt, firstCorrectCorrection } from "@/domain/training/attempt-ordering";
import type { ChildReflection } from "@/services/training/error-observation-service";

export type MasteryEvidenceView = {
  id: string;
  sessionItemId: string;
  occurredOn: string;
  stem: string;
  firstAnswer: string | null;
  firstAttemptCorrect: boolean;
  independent: boolean;
  hintLevel: number | null;
  activeDurationMs: number | null;
};

export type AbilityView = {
  skillId: string;
  skillCode: string;
  skillName: string;
  domain: string;
  status: MasteryStatus;
  reasonCode: string;
  reason: string;
  evidenceCount: number;
  updatedOn: string | null;
  evidenceCursor: string | null;
  supportingEvidenceIds: string[];
  evidence: MasteryEvidenceView[];
};

export type ErrorAuditView = {
  id: string;
  source: "system" | "child" | "parent";
  value: ErrorCause | ChildReflection;
  previousValue: ErrorCause | ChildReflection | null;
  actorName: string | null;
  observedAt: number;
};

export type ErrorEvidenceView = {
  rootObservationId: string;
  sessionItemId: string;
  stem: string;
  firstAnswer: string | null;
  correctedAnswer: string | null;
  skillName: string;
  occurredOn: string;
  activeDurationMs: number | null;
  effectiveCause: ErrorCause;
  effectiveCategory: ErrorCategory;
  effectiveSource: "system" | "child" | "parent";
  history: ErrorAuditView[];
};

export type ErrorSummaryView = { knowledge: number; habit: number; unknown: number };

export type DueReviewView = {
  skillId: string;
  skillCode: string;
  skillName: string;
  level: number;
  dueOn: string;
  overdueDays: number;
  lastResult: "independent_correct" | "hinted_correct" | "corrected" | "incorrect" | null;
  supportingEvidenceIds: string[];
  trigger: EvidenceTriggerView | null;
};

export type EvidenceTriggerView = {
  evidenceId: string;
  attemptId: string | null;
  sessionItemId: string;
  sessionId: string;
  occurredOn: string;
  stem: string;
  result: "independent_correct" | "hinted_correct" | "corrected" | "incorrect" | "diagnostic_reset";
  firstAttemptCorrect: boolean;
  independent: boolean;
  hintLevel: number | null;
};

export type DosageSessionView = {
  sessionId: string;
  on: string;
  independentCorrectCount: number;
  totalCount: number;
  accuracy: number;
  highestHintLevel: number | null;
  dueReviewOutcome: "passed" | "failed" | null;
  cappedStructureNeedsSupport: boolean;
  supportingEvidenceIds: string[];
  attemptIds: string[];
  evidence: EvidenceTriggerView[];
};

export type DosageView = {
  track: "computation" | "equation";
  level: number;
  weeklyTarget: number;
  sessionMin: number;
  sessionTarget: number;
  sessionMax: number;
  reasonCode: "advance" | "hold" | "support" | "insufficient_evidence";
  parentInterventionSuggested: boolean;
  supportingEvidenceIds: string[];
  recentWindow: DosageSessionView[];
};

export type ParentLearningStateView = {
  asOf: string;
  abilityMap: AbilityView[];
  errorSummary: ErrorSummaryView;
  errors: ErrorEvidenceView[];
  dueReviews: DueReviewView[];
  dosage: { computation: DosageView | null; equation: DosageView | null };
};

const reflectionCause: Record<ChildReflection, ErrorCause> = {
  did_not_read: "incomplete_reading",
  missed_condition_or_unit: "missing_unit",
  calculation_slip: "calculation",
  method_unknown: "relationship",
};

function isMasteryReasonCode(reasonCode: string): reasonCode is MasteryReasonCode {
  return reasonCode in masteryReasonDescriptions;
}

function abilityReason(status: MasteryStatus, reasonCode: string, evidenceCount: number, dates: string[]) {
  if (reasonCode === "legacy_snapshot") {
    return "旧版聚合快照保留了一个历史状态，但缺少可验证的诊断遥测；当前状态不可下钻正式证据。请完成新诊断后再按当前证据解释。";
  }
  const period = dates.length === 0
    ? "还没有正式证据"
    : dates.length === 1
      ? `证据日期 ${dates[0]}`
      : `证据覆盖 ${dates[0]} 至 ${dates.at(-1)}`;
  const fallback: Record<MasteryStatus, string> = {
    undiagnosed: "尚未形成可解释的能力状态。",
    needs_support: "现有独立首答证据显示需要更多支持。",
    learning: "现有证据尚未达到基础掌握门槛。",
    basic: "已达到基础掌握门槛，仍需通过跨结构的到期复习。",
    stable: "已通过跨日、跨结构的到期复习检验。",
  };
  return `${isMasteryReasonCode(reasonCode) ? masteryReasonDescriptions[reasonCode] : fallback[status]} ${period}，共 ${evidenceCount} 条。`;
}

function masteryInput(row: typeof masteryEvidence.$inferSelect): MasteryEvidenceInput {
  return {
    id: row.id,
    purpose: row.purpose,
    templateId: row.templateId,
    structureTag: row.structureTag,
    difficulty: row.difficulty as MasteryEvidenceInput["difficulty"],
    firstAttemptCorrect: row.firstAttemptCorrect,
    independent: row.independent,
    hintLevel: row.hintLevel as MasteryEvidenceInput["hintLevel"],
    occurredOn: row.occurredOn,
    occurredAt: row.occurredAt,
    diagnosticRunId: row.diagnosticRunId,
    diagnosticCompletedOn: row.diagnosticCompletedOn,
    diagnosticCompletedAt: row.diagnosticCompletedAt,
    reviewIntervalDays: row.reviewIntervalDays as MasteryEvidenceInput["reviewIntervalDays"],
  };
}

function dayDifference(later: string, earlier: string) {
  return Math.max(0, Math.round((Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86_400_000));
}

function parseDosageReason(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const reasonCode = "reasonCode" in parsed && ["advance", "hold", "support", "insufficient_evidence"].includes(String(parsed.reasonCode))
      ? parsed.reasonCode as DosageView["reasonCode"]
      : "insufficient_evidence";
    return {
      reasonCode,
      parentInterventionSuggested: "parentInterventionSuggested" in parsed && parsed.parentInterventionSuggested === true,
    };
  } catch {
    return null;
  }
}

export function getLearningState(
  db: AppDatabase,
  childId: string,
  now: Date | number = Date.now(),
): ParentLearningStateView {
  return db.transaction((tx) => {
    const asOf = shanghaiDateKey(now);
    const skillRows = tx.select().from(skills).orderBy(asc(skills.domain), asc(skills.name)).all();
    const stateRows = tx.select().from(masteryStates).where(eq(masteryStates.childId, childId)).all();
    const stateBySkill = new Map(stateRows.map((row) => [row.skillId, row]));
    const evidenceRows = tx.select({
      evidence: masteryEvidence,
      stem: sessionItems.stemSnapshot,
      sessionId: trainingSessions.id,
      sessionDate: trainingSessions.sessionDate,
      sessionKind: trainingSessions.kind,
      sessionStatus: trainingSessions.status,
    }).from(masteryEvidence)
      .innerJoin(sessionItems, eq(masteryEvidence.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(masteryEvidence.childId, childId))
      .orderBy(asc(masteryEvidence.occurredOn), asc(masteryEvidence.occurredAt), asc(masteryEvidence.id))
      .all();
    const attemptRows = tx.select({
      attempt: attempts,
      sessionItemId: sessionItems.id,
    }).from(attempts)
      .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(trainingSessions.childId, childId))
      .orderBy(asc(attempts.submittedAt), asc(attempts.id))
      .all();
    const attemptsByItem = new Map<string, Array<typeof attempts.$inferSelect>>();
    for (const row of attemptRows) {
      const values = attemptsByItem.get(row.sessionItemId) ?? [];
      values.push(row.attempt);
      attemptsByItem.set(row.sessionItemId, values);
    }

    const triggerFor = (row: typeof evidenceRows[number]): EvidenceTriggerView => {
      const itemAttempts = attemptsByItem.get(row.evidence.sessionItemId) ?? [];
      const first = firstAttempt(itemAttempts);
      const correction = firstCorrectCorrection(itemAttempts);
      const result = row.evidence.purpose === "diagnostic"
        ? "diagnostic_reset" as const
        : correction ? "corrected" as const
          : !row.evidence.firstAttemptCorrect ? "incorrect" as const
            : row.evidence.independent ? "independent_correct" as const : "hinted_correct" as const;
      return {
        evidenceId: row.evidence.id,
        attemptId: correction?.id ?? first?.id ?? null,
        sessionItemId: row.evidence.sessionItemId,
        sessionId: row.sessionId,
        occurredOn: correction ? shanghaiDateKey(correction.submittedAt) : row.evidence.occurredOn,
        stem: row.stem,
        result,
        firstAttemptCorrect: row.evidence.firstAttemptCorrect,
        independent: row.evidence.independent,
        hintLevel: row.evidence.hintLevel,
      };
    };

    const evidenceBySkill = new Map<string, MasteryEvidenceView[]>();
    const rawEvidenceBySkill = new Map<string, Array<typeof masteryEvidence.$inferSelect>>();
    for (const row of evidenceRows) {
      const first = firstAttempt(attemptsByItem.get(row.evidence.sessionItemId) ?? []);
      const view: MasteryEvidenceView = {
        id: row.evidence.id,
        sessionItemId: row.evidence.sessionItemId,
        occurredOn: row.evidence.occurredOn,
        stem: row.stem,
        firstAnswer: first?.answerText ?? null,
        firstAttemptCorrect: row.evidence.firstAttemptCorrect,
        independent: row.evidence.independent,
        hintLevel: row.evidence.hintLevel,
        activeDurationMs: first?.activeDurationMs ?? null,
      };
      const values = evidenceBySkill.get(row.evidence.skillId) ?? [];
      values.push(view);
      evidenceBySkill.set(row.evidence.skillId, values);
      const rawValues = rawEvidenceBySkill.get(row.evidence.skillId) ?? [];
      rawValues.push(row.evidence);
      rawEvidenceBySkill.set(row.evidence.skillId, rawValues);
    }

    const abilityMap = skillRows.map((skill): AbilityView => {
      const state = stateBySkill.get(skill.id);
      const evidence = evidenceBySkill.get(skill.id) ?? [];
      const status = state?.status ?? "undiagnosed";
      const reasonCode = state?.reasonCode ?? "no_evidence";
      const derived = deriveMasteryState(
        (rawEvidenceBySkill.get(skill.id) ?? []).map(masteryInput),
        state?.status ?? "undiagnosed",
      );
      const supportingEvidenceIds = derived.reasonCode === reasonCode
        ? derived.supportingEvidenceIds
        : state?.evidenceCursor ? [state.evidenceCursor] : [];
      const supportingDates = supportingEvidenceIds
        .map((id) => evidence.find((item) => item.id === id)?.occurredOn)
        .filter((date): date is string => date !== undefined);
      const dates = [...new Set(supportingDates.length > 0 ? supportingDates : evidence.map((item) => item.occurredOn))];
      return {
        skillId: skill.id,
        skillCode: skill.code,
        skillName: skill.name,
        domain: skill.domain,
        status,
        reasonCode,
        reason: abilityReason(status, reasonCode, state?.evidenceCount ?? 0, dates),
        evidenceCount: state?.evidenceCount ?? 0,
        updatedOn: state ? shanghaiDateKey(state.updatedAt) : null,
        evidenceCursor: state?.evidenceCursor ?? null,
        supportingEvidenceIds,
        evidence,
      };
    });

    const actorRows = tx.select({ id: users.id, name: users.displayName }).from(users).all();
    const actorNames = new Map(actorRows.map((actor) => [actor.id, actor.name]));
    const observationRows = tx.select().from(errorObservations)
      .where(eq(errorObservations.childId, childId))
      .orderBy(asc(errorObservations.observedAt), asc(errorObservations.id)).all();
    const observationByPrevious = new Map<string, typeof observationRows[number]>();
    for (const row of observationRows) {
      if (row.previousObservationId) observationByPrevious.set(row.previousObservationId, row);
    }
    const itemRows = tx.select({
      id: sessionItems.id,
      stem: sessionItems.stemSnapshot,
      skillName: sessionItems.skillNameSnapshot,
    }).from(sessionItems)
      .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
      .where(eq(trainingSessions.childId, childId)).all();
    const itemById = new Map(itemRows.map((item) => [item.id, item]));
    const roots = observationRows.filter((row) => row.source === "system" && row.previousObservationId === null);
    const errors = roots.map((root): ErrorEvidenceView => {
      const chain = [root];
      while (observationByPrevious.has(chain.at(-1)!.id)) {
        chain.push(observationByPrevious.get(chain.at(-1)!.id)!);
      }
      const parent = [...chain].reverse().find((row) => row.source === "parent");
      const child = [...chain].reverse().find((row) => row.source === "child");
      const effectiveCause = parent?.parentCorrection
        ?? (child?.childSelfReport ? reflectionCause[child.childSelfReport] : null)
        ?? root.systemCandidate
        ?? "unknown";
      const itemAttempts = attemptsByItem.get(root.sessionItemId) ?? [];
      const first = firstAttempt(itemAttempts);
      const corrected = firstCorrectCorrection(itemAttempts);
      const item = itemById.get(root.sessionItemId);
      return {
        rootObservationId: root.id,
        sessionItemId: root.sessionItemId,
        stem: item?.stem ?? "历史题目快照不可用",
        firstAnswer: first?.answerText ?? null,
        correctedAnswer: corrected?.answerText ?? null,
        skillName: item?.skillName ?? "历史能力点",
        occurredOn: shanghaiDateKey(first?.submittedAt ?? root.observedAt),
        activeDurationMs: first?.activeDurationMs ?? null,
        effectiveCause,
        effectiveCategory: errorCategory(effectiveCause),
        effectiveSource: parent ? "parent" : child ? "child" : "system",
        history: chain.map((row): ErrorAuditView => ({
          id: row.id,
          source: row.source,
          value: (row.parentCorrection ?? row.childSelfReport ?? row.systemCandidate ?? "unknown"),
          previousValue: row.previousValue,
          actorName: row.actorId ? actorNames.get(row.actorId) ?? null : null,
          observedAt: row.observedAt,
        })),
      };
    });
    const errorSummary = errors.reduce<ErrorSummaryView>((summary, error) => {
      summary[error.effectiveCategory] += 1;
      return summary;
    }, { knowledge: 0, habit: 0, unknown: 0 });

    const dueReviews = tx.select({
      schedule: reviewSchedules,
      skillCode: skills.code,
      skillName: skills.name,
    }).from(reviewSchedules)
      .innerJoin(skills, eq(reviewSchedules.skillId, skills.id))
      .where(eq(reviewSchedules.childId, childId))
      .orderBy(asc(reviewSchedules.dueOn), asc(skills.name)).all()
      .filter((row) => row.schedule.dueOn <= asOf)
      .map((row): DueReviewView => {
        const candidates = evidenceRows.filter((item) => item.evidence.skillId === row.schedule.skillId)
          .flatMap((item) => {
            const trigger = triggerFor(item);
            const correction = !item.evidence.firstAttemptCorrect
              ? firstCorrectCorrection(attemptsByItem.get(item.evidence.sessionItemId) ?? [])
              : null;
            const event = reviewEventIdentity(item.evidence, correction && {
              id: correction.id,
              on: shanghaiDateKey(correction.submittedAt),
              at: correction.submittedAt,
            });
            return event ? [{
              item,
              trigger,
              event,
            }] : [];
          })
          .filter((candidate) => row.schedule.lastResult === null
            ? candidate.trigger.result === "diagnostic_reset"
            : candidate.trigger.result === row.schedule.lastResult)
          .sort((left, right) => compareReviewEvents(left.event, right.event)
            || left.item.evidence.id.localeCompare(right.item.evidence.id));
        const selected = candidates.filter((candidate) => candidate.event.at === row.schedule.updatedAt).at(-1)
          ?? candidates.filter((candidate) => candidate.event.at <= row.schedule.updatedAt).at(-1)
          ?? candidates.at(-1)
          ?? null;
        const supportingEvidenceIds = selected?.trigger.result === "diagnostic_reset"
          && selected.item.evidence.diagnosticRunId
          ? evidenceRows.filter((item) => (
            item.evidence.diagnosticRunId === selected.item.evidence.diagnosticRunId
          )).map((item) => item.evidence.id)
          : selected ? [selected.item.evidence.id] : [];
        return {
          skillId: row.schedule.skillId,
          skillCode: row.skillCode,
          skillName: row.skillName,
          level: row.schedule.level,
          dueOn: row.schedule.dueOn,
          overdueDays: dayDifference(asOf, row.schedule.dueOn),
          lastResult: row.schedule.lastResult,
          supportingEvidenceIds,
          trigger: selected?.trigger ?? null,
        };
      });

    const completedDiagnosis = evidenceRows.filter((row) => (
      row.evidence.purpose === "diagnostic"
      && row.evidence.diagnosticCompletedOn !== null
      && row.evidence.diagnosticCompletedAt !== null
    )).sort((left, right) => (
      left.evidence.diagnosticCompletedOn!.localeCompare(right.evidence.diagnosticCompletedOn!)
      || left.evidence.diagnosticCompletedAt! - right.evidence.diagnosticCompletedAt!
    )).at(-1) ?? null;
    const dosageWindows = new Map<"computation" | "equation", DosageSessionView[]>();
    for (const track of ["computation", "equation"] as const) {
      const grouped = new Map<string, typeof evidenceRows>();
      for (const row of evidenceRows) {
        if (row.evidence.dosageTrack !== track || row.evidence.purpose === "diagnostic"
          || row.sessionStatus !== "completed"
          || !["daily", "review", "assessment"].includes(row.sessionKind)) continue;
        if (completedDiagnosis && (row.evidence.occurredOn < completedDiagnosis.evidence.diagnosticCompletedOn!
          || (row.evidence.occurredOn === completedDiagnosis.evidence.diagnosticCompletedOn!
            && row.evidence.occurredAt <= completedDiagnosis.evidence.diagnosticCompletedAt!))) continue;
        const rows = grouped.get(row.sessionId) ?? [];
        rows.push(row);
        grouped.set(row.sessionId, rows);
      }
      const sessions = [...grouped.entries()].map(([sessionId, rows]): DosageSessionView => {
        const evidence = rows.map(triggerFor);
        const independentCorrectCount = rows.filter((row) => (
          row.evidence.firstAttemptCorrect && row.evidence.independent
        )).length;
        const hintLevels = rows.map((row) => row.evidence.hintLevel);
        const reviewRows = rows.filter((row) => row.evidence.purpose === "review");
        const structureStats = new Map<string, { count: number; correct: number }>();
        for (const row of rows) {
          const stats = structureStats.get(row.evidence.structureTag) ?? { count: 0, correct: 0 };
          stats.count += 1;
          if (row.evidence.firstAttemptCorrect && row.evidence.independent) stats.correct += 1;
          structureStats.set(row.evidence.structureTag, stats);
        }
        return {
          sessionId,
          on: rows[0].sessionDate,
          independentCorrectCount,
          totalCount: rows.length,
          accuracy: rows.length === 0 ? 0 : independentCorrectCount / rows.length,
          highestHintLevel: hintLevels.some((level) => level === null)
            ? null
            : Math.max(0, ...hintLevels as number[]),
          dueReviewOutcome: reviewRows.length === 0 ? null
            : reviewRows.every((row) => row.evidence.firstAttemptCorrect && row.evidence.independent)
              ? "passed" : "failed",
          cappedStructureNeedsSupport: [...structureStats.values()].some((stats) => (
            stats.count >= 6 && stats.correct / stats.count < 0.7
          )),
          supportingEvidenceIds: evidence.map((item) => item.evidenceId),
          attemptIds: evidence.flatMap((item) => item.attemptId ? [item.attemptId] : []),
          evidence,
        };
      }).sort((left, right) => left.on.localeCompare(right.on)
        || left.sessionId.localeCompare(right.sessionId));
      const recentDays = [...new Set(sessions.map((session) => session.on))].slice(-2);
      dosageWindows.set(track, sessions.filter((session) => recentDays.includes(session.on)));
    }

    const dosageRows = tx.select().from(dosageStates).where(eq(dosageStates.childId, childId)).all();
    const dosageByTrack = new Map(dosageRows.map((row) => [row.track, row]));
    const dosageFor = (track: "computation" | "equation"): DosageView | null => {
      const row = dosageByTrack.get(track);
      if (!row) return null;
      const reason = parseDosageReason(row.reasonJson) ?? {
        reasonCode: "insufficient_evidence" as const,
        parentInterventionSuggested: false,
      };
      const recentWindow = dosageWindows.get(track) ?? [];
      return {
        track,
        level: row.level,
        weeklyTarget: row.weeklyTarget,
        sessionMin: row.sessionMinimum,
        sessionTarget: row.sessionTarget,
        sessionMax: row.sessionMaximum,
        ...reason,
        supportingEvidenceIds: recentWindow.flatMap((session) => session.supportingEvidenceIds),
        recentWindow,
      };
    };

    return {
      asOf,
      abilityMap,
      errorSummary,
      errors,
      dueReviews,
      dosage: { computation: dosageFor("computation"), equation: dosageFor("equation") },
    };
  });
}
