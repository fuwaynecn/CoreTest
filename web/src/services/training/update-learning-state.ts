import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  dosageStates, masteryEvidence, masteryStates, reviewSchedules,
  sessionItems, skills, trainingSessions,
} from "@/db/schema";
import {
  deriveDosageState,
  type DosageState,
  type DosageTrack,
  type TrackSessionSummary,
} from "@/domain/dosage/derive-dosage";
import {
  nextReviewState,
  REVIEW_DAYS,
  type ReviewLevel,
  type ReviewOutcome,
} from "@/domain/review/next-review";
import { addShanghaiDays } from "@/domain/time/shanghai-calendar";
import {
  deriveMasteryState,
  type MasteryEvidenceInput,
} from "@/domain/training/mastery";

type LearningStateStore = Pick<AppDatabase, "select" | "insert">;

type EvidenceRow = typeof masteryEvidence.$inferSelect;

function masteryInput(row: EvidenceRow): MasteryEvidenceInput {
  return {
    id: row.id,
    purpose: row.purpose,
    templateId: row.templateId,
    structureTag: row.structureTag,
    difficulty: row.difficulty as 1 | 2 | 3 | 4,
    firstAttemptCorrect: row.firstAttemptCorrect,
    independent: row.independent,
    hintLevel: row.hintLevel as 0 | 1 | 2 | 3 | null,
    occurredOn: row.occurredOn,
    occurredAt: row.occurredAt,
    diagnosticRunId: row.diagnosticRunId,
    diagnosticCompletedOn: row.diagnosticCompletedOn,
    diagnosticCompletedAt: row.diagnosticCompletedAt,
    reviewIntervalDays: row.reviewIntervalDays as 0 | 1 | 3 | 7 | 14 | 30,
  };
}

function persistMastery(db: LearningStateStore, evidence: EvidenceRow, rows: EvidenceRow[]) {
  const current = db.select({
    status: masteryStates.status,
    evidenceCursor: masteryStates.evidenceCursor,
    updatedAt: masteryStates.updatedAt,
  }).from(masteryStates).where(and(
    eq(masteryStates.childId, evidence.childId),
    eq(masteryStates.skillId, evidence.skillId),
  )).get();
  const state = deriveMasteryState(rows.map(masteryInput), current?.status);
  const cursor = state.evidenceCursor ?? current?.evidenceCursor ?? null;
  const updatedAt = state.lastAppliedAt ?? current?.updatedAt ?? evidence.occurredAt;
  db.insert(masteryStates).values({
    childId: evidence.childId,
    skillId: evidence.skillId,
    status: state.status,
    evidenceCount: state.evidenceCount,
    correctCount: state.firstAttemptCorrectCount,
    reasonCode: state.reasonCode,
    evidenceCursor: cursor,
    evidenceVersion: rows.length,
    updatedAt,
  }).onConflictDoUpdate({
    target: [masteryStates.childId, masteryStates.skillId],
    set: {
      status: state.status,
      evidenceCount: state.evidenceCount,
      correctCount: state.firstAttemptCorrectCount,
      reasonCode: state.reasonCode,
      evidenceCursor: cursor,
      evidenceVersion: rows.length,
      updatedAt,
    },
  }).run();
  return state;
}

type ReviewSnapshot = {
  level: ReviewLevel;
  dueOn: string;
  lastResult: ReviewOutcome | null;
  updatedAt: number;
};

function outcome(row: EvidenceRow): ReviewOutcome {
  if (!row.firstAttemptCorrect) return "incorrect";
  return row.independent ? "independent_correct" : "hinted_correct";
}

function deriveReview(rows: EvidenceRow[]): ReviewSnapshot | null {
  const events: Array<{
    on: string;
    at: number;
    id: string;
    diagnostic: boolean;
    row?: EvidenceRow;
  }> = rows.filter((row) => row.purpose !== "diagnostic").map((row) => ({
    on: row.occurredOn, at: row.occurredAt, id: row.id, diagnostic: false, row,
  }));
  const diagnosticRuns = new Map<string, EvidenceRow>();
  for (const row of rows) {
    if (row.purpose !== "diagnostic" || row.diagnosticRunId === null
      || row.diagnosticCompletedOn === null || row.diagnosticCompletedAt === null) continue;
    diagnosticRuns.set(row.diagnosticRunId, row);
  }
  for (const [runId, row] of diagnosticRuns) {
    events.push({
      on: row.diagnosticCompletedOn!, at: row.diagnosticCompletedAt!,
      id: runId, diagnostic: true,
    });
  }
  events.sort((left, right) => left.on.localeCompare(right.on)
    || left.at - right.at || left.id.localeCompare(right.id));

  let state: ReviewSnapshot | null = null;
  for (const event of events) {
    if (event.diagnostic) {
      state = {
        level: 0,
        dueOn: addShanghaiDays(event.on, REVIEW_DAYS[0]),
        lastResult: null,
        updatedAt: event.at,
      };
      continue;
    }
    if (!event.row) continue;
    const currentLevel = state?.level ?? 0;
    state = {
      ...nextReviewState({ level: currentLevel, outcome: outcome(event.row), on: event.on }),
      updatedAt: event.at,
    };
  }
  return state;
}

function trackForDomain(domain: string): DosageTrack | null {
  if (domain === "equation_algebra" || domain.includes("方程")) return "equation";
  if (domain === "number_operations" || domain.includes("数与运算")) return "computation";
  return null;
}

type SessionAccumulator = TrackSessionSummary & { structures: Map<string, number> };

function summarizeTrackSessions(
  db: LearningStateStore,
  childId: string,
  after: { on: string; at: number } | null,
) {
  const rows = db.select({
    evidence: masteryEvidence,
    sessionId: trainingSessions.id,
    sessionDate: trainingSessions.sessionDate,
    domain: skills.domain,
  }).from(masteryEvidence)
    .innerJoin(sessionItems, eq(masteryEvidence.sessionItemId, sessionItems.id))
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .innerJoin(skills, eq(masteryEvidence.skillId, skills.id))
    .where(eq(masteryEvidence.childId, childId))
    .orderBy(asc(masteryEvidence.occurredOn), asc(masteryEvidence.occurredAt), asc(masteryEvidence.id))
    .all();
  const grouped: Record<DosageTrack, Map<string, SessionAccumulator>> = {
    computation: new Map(), equation: new Map(),
  };
  for (const row of rows) {
    if (row.evidence.purpose === "diagnostic") continue;
    if (after && (row.evidence.occurredOn < after.on
      || (row.evidence.occurredOn === after.on && row.evidence.occurredAt <= after.at))) continue;
    const track = trackForDomain(row.domain);
    if (!track) continue;
    const key = row.sessionId;
    const current = grouped[track].get(key) ?? {
      sessionId: key,
      on: row.sessionDate,
      independentCorrectCount: 0,
      totalCount: 0,
      highestHintLevel: 0,
      dueReviewOutcome: null,
      sameStructureMaxCount: 0,
      structures: new Map<string, number>(),
    };
    current.totalCount += 1;
    if (row.evidence.firstAttemptCorrect && row.evidence.independent) {
      current.independentCorrectCount += 1;
    }
    current.highestHintLevel = row.evidence.hintLevel === null
      ? null
      : current.highestHintLevel === null
        ? null
        : Math.max(current.highestHintLevel, row.evidence.hintLevel) as 0 | 1 | 2 | 3;
    if (row.evidence.purpose === "review") {
      current.dueReviewOutcome = row.evidence.firstAttemptCorrect && row.evidence.independent
        && current.dueReviewOutcome !== "failed" ? "passed" : "failed";
    }
    const count = (current.structures.get(row.evidence.structureTag) ?? 0) + 1;
    current.structures.set(row.evidence.structureTag, count);
    current.sameStructureMaxCount = Math.max(current.sameStructureMaxCount, count);
    grouped[track].set(key, current);
  }
  const withoutStructureCounts = (summary: SessionAccumulator): TrackSessionSummary => ({
    sessionId: summary.sessionId,
    on: summary.on,
    independentCorrectCount: summary.independentCorrectCount,
    totalCount: summary.totalCount,
    highestHintLevel: summary.highestHintLevel,
    dueReviewOutcome: summary.dueReviewOutcome,
    sameStructureMaxCount: summary.sameStructureMaxCount,
  });
  return {
    computation: [...grouped.computation.values()].map(withoutStructureCounts),
    equation: [...grouped.equation.values()].map(withoutStructureCounts),
  };
}

function deriveTrack(track: DosageTrack, sessions: TrackSessionSummary[]): DosageState {
  let state: DosageState | undefined;
  for (let index = 0; index < sessions.length; index += 1) {
    state = deriveDosageState({ track, current: state, sessions: sessions.slice(0, index + 1) });
  }
  return state ?? deriveDosageState({ track, sessions: [] });
}

export function updateLearningState(
  db: LearningStateStore,
  evidenceId: string,
) {
  const evidence = db.select().from(masteryEvidence).where(eq(masteryEvidence.id, evidenceId)).get();
  if (!evidence) throw new Error("Learning evidence does not exist");
  const skillRows = db.select().from(masteryEvidence).where(and(
    eq(masteryEvidence.childId, evidence.childId),
    eq(masteryEvidence.skillId, evidence.skillId),
  )).orderBy(
    asc(masteryEvidence.occurredOn), asc(masteryEvidence.occurredAt), asc(masteryEvidence.id),
  ).all();

  const mastery = persistMastery(db, evidence, skillRows);
  const review = deriveReview(skillRows);
  if (review) {
    db.insert(reviewSchedules).values({
      childId: evidence.childId,
      skillId: evidence.skillId,
      ...review,
    }).onConflictDoUpdate({
      target: [reviewSchedules.childId, reviewSchedules.skillId],
      set: review,
    }).run();
  }

  const allChildEvidence = db.select({
    occurredAt: masteryEvidence.occurredAt,
    diagnosticCompletedOn: masteryEvidence.diagnosticCompletedOn,
    diagnosticCompletedAt: masteryEvidence.diagnosticCompletedAt,
  }).from(masteryEvidence).where(eq(masteryEvidence.childId, evidence.childId)).all();
  const latestDiagnosis = allChildEvidence
    .filter((row): row is typeof row & {
      diagnosticCompletedOn: string;
      diagnosticCompletedAt: number;
    } => row.diagnosticCompletedOn !== null && row.diagnosticCompletedAt !== null)
    .sort((left, right) => left.diagnosticCompletedOn.localeCompare(right.diagnosticCompletedOn)
      || left.diagnosticCompletedAt - right.diagnosticCompletedAt)
    .at(-1) ?? null;
  const summaries = summarizeTrackSessions(db, evidence.childId, latestDiagnosis && {
    on: latestDiagnosis.diagnosticCompletedOn,
    at: latestDiagnosis.diagnosticCompletedAt,
  });
  const updatedAt = Math.max(...allChildEvidence.map((row) => (
    Math.max(row.occurredAt, row.diagnosticCompletedAt ?? 0)
  )));
  for (const track of ["computation", "equation"] as const) {
    const state = deriveTrack(track, summaries[track]);
    db.insert(dosageStates).values({
      childId: evidence.childId,
      track,
      level: state.level,
      weeklyTarget: state.weeklyTarget,
      sessionMinimum: state.sessionMin,
      sessionTarget: state.sessionTarget,
      sessionMaximum: state.sessionMax,
      reasonJson: JSON.stringify({
        reasonCode: state.reasonCode,
        sameStructureCap: state.sameStructureCap,
        parentInterventionSuggested: state.parentInterventionSuggested,
      }),
      updatedAt,
    }).onConflictDoUpdate({
      target: [dosageStates.childId, dosageStates.track],
      set: {
        level: state.level,
        weeklyTarget: state.weeklyTarget,
        sessionMinimum: state.sessionMin,
        sessionTarget: state.sessionTarget,
        sessionMaximum: state.sessionMax,
        reasonJson: JSON.stringify({
          reasonCode: state.reasonCode,
          sameStructureCap: state.sameStructureCap,
          parentInterventionSuggested: state.parentInterventionSuggested,
        }),
        updatedAt,
      },
    }).run();
  }
  return mastery;
}
