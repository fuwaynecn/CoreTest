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
import {
  deriveMasteryState,
  masteryReasonDescriptions,
  type MasteryEvidenceInput,
  type MasteryReasonCode,
} from "@/domain/training/mastery";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
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
    }).from(masteryEvidence)
      .innerJoin(sessionItems, eq(masteryEvidence.sessionItemId, sessionItems.id))
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

    const evidenceBySkill = new Map<string, MasteryEvidenceView[]>();
    const rawEvidenceBySkill = new Map<string, Array<typeof masteryEvidence.$inferSelect>>();
    for (const row of evidenceRows) {
      const first = attemptsByItem.get(row.evidence.sessionItemId)?.[0] ?? null;
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
      const first = itemAttempts[0] ?? null;
      const corrected = itemAttempts.find((attempt) => attempt.isCorrect && (attempt.correctionNumber ?? 0) > 0) ?? null;
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
      .map((row): DueReviewView => ({
        skillId: row.schedule.skillId,
        skillCode: row.skillCode,
        skillName: row.skillName,
        level: row.schedule.level,
        dueOn: row.schedule.dueOn,
        overdueDays: dayDifference(asOf, row.schedule.dueOn),
        lastResult: row.schedule.lastResult,
      }));

    const dosageRows = tx.select().from(dosageStates).where(eq(dosageStates.childId, childId)).all();
    const dosageByTrack = new Map(dosageRows.map((row) => [row.track, row]));
    const dosageFor = (track: "computation" | "equation"): DosageView | null => {
      const row = dosageByTrack.get(track);
      if (!row) return null;
      const reason = parseDosageReason(row.reasonJson) ?? {
        reasonCode: "insufficient_evidence" as const,
        parentInterventionSuggested: false,
      };
      return {
        track,
        level: row.level,
        weeklyTarget: row.weeklyTarget,
        sessionMin: row.sessionMinimum,
        sessionTarget: row.sessionTarget,
        sessionMax: row.sessionMaximum,
        ...reason,
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
