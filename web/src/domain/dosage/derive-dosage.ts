export type DosageTrack = "computation" | "equation";
export type DosageReasonCode = "advance" | "hold" | "support" | "insufficient_evidence";

export type TrackSessionSummary = {
  sessionId: string;
  on: string;
  independentCorrectCount: number;
  totalCount: number;
  highestHintLevel: 0 | 1 | 2 | 3 | null;
  dueReviewOutcome: "passed" | "failed" | null;
  structureStats: Record<string, {
    count: number;
    independentCorrectCount: number;
  }>;
};

export type DosageState = {
  track: DosageTrack;
  level: number;
  weeklyTarget: number;
  sessionMin: number;
  sessionTarget: number;
  sessionMax: number;
  reasonCode: DosageReasonCode;
  sameStructureCap: 6;
  parentInterventionSuggested: boolean;
};

type CurrentDosage = Pick<
  DosageState,
  "level" | "weeklyTarget" | "sessionMin" | "sessionTarget" | "sessionMax"
>;

const DEFAULTS: Record<DosageTrack, CurrentDosage> = {
  computation: { level: 1, weeklyTarget: 60, sessionMin: 12, sessionTarget: 15, sessionMax: 19 },
  equation: { level: 1, weeklyTarget: 15, sessionMin: 4, sessionTarget: 5, sessionMax: 6 },
};

function mergeDueReview(
  current: TrackSessionSummary["dueReviewOutcome"],
  incoming: TrackSessionSummary["dueReviewOutcome"],
) {
  if (current === "failed" || incoming === "failed") return "failed";
  if (current === "passed" || incoming === "passed") return "passed";
  return null;
}

export function aggregateTrackDays(sessions: readonly TrackSessionSummary[]) {
  const days = new Map<string, TrackSessionSummary>();
  for (const summary of sessions) {
    const current = days.get(summary.on) ?? {
      sessionId: `day:${summary.on}`,
      on: summary.on,
      independentCorrectCount: 0,
      totalCount: 0,
      highestHintLevel: 0,
      dueReviewOutcome: null,
      structureStats: {},
    } satisfies TrackSessionSummary;
    current.independentCorrectCount += summary.independentCorrectCount;
    current.totalCount += summary.totalCount;
    current.highestHintLevel = current.highestHintLevel === null || summary.highestHintLevel === null
      ? null
      : Math.max(current.highestHintLevel, summary.highestHintLevel) as 0 | 1 | 2 | 3;
    current.dueReviewOutcome = mergeDueReview(current.dueReviewOutcome, summary.dueReviewOutcome);
    for (const [structureTag, stats] of Object.entries(summary.structureStats)) {
      const aggregate = current.structureStats[structureTag] ?? {
        count: 0, independentCorrectCount: 0,
      };
      aggregate.count += stats.count;
      aggregate.independentCorrectCount += stats.independentCorrectCount;
      current.structureStats[structureTag] = aggregate;
    }
    days.set(summary.on, current);
  }
  return [...days.values()].sort((left, right) => left.on.localeCompare(right.on));
}

function latestDistinctDays(sessions: readonly TrackSessionSummary[]) {
  return aggregateTrackDays(sessions).slice(-2);
}

function rate(summary: TrackSessionSummary) {
  return summary.totalCount > 0
    ? summary.independentCorrectCount * 100 / summary.totalCount
    : 0;
}

export function deriveDosageState(input: {
  track: DosageTrack;
  current?: CurrentDosage;
  sessions: readonly TrackSessionSummary[];
}): DosageState {
  const current = input.current ?? DEFAULTS[input.track];
  const maxLevel = input.track === "computation" ? 7 : 6;
  const recent = latestDistinctDays(input.sessions);
  let level = current.level;
  let reasonCode: DosageReasonCode = "insufficient_evidence";

  if (recent.length === 2) {
    const rates = recent.map(rate);
    const failedDueReview = recent.some((summary) => summary.dueReviewOutcome === "failed");
    const passedDueReview = recent.some((summary) => summary.dueReviewOutcome === "passed");
    const highHint = recent.some((summary) => (
      summary.highestHintLevel === null || summary.highestHintLevel >= 2
    ));
    if (passedDueReview && !failedDueReview && !highHint && rates.every((value) => value >= 90)) {
      const next = Math.min(level + 1, maxLevel);
      reasonCode = next > level ? "advance" : "hold";
      level = next;
    } else if (failedDueReview || rates.some((value) => value < 70)) {
      level = Math.max(level - 1, 1);
      reasonCode = "support";
    } else {
      reasonCode = "hold";
    }
  }

  return {
    track: input.track,
    level,
    weeklyTarget: current.weeklyTarget,
    sessionMin: current.sessionMin,
    sessionTarget: current.sessionTarget,
    sessionMax: current.sessionMax,
    reasonCode,
    sameStructureCap: 6,
    parentInterventionSuggested: reasonCode === "support"
      && recent.some((summary) => Object.values(summary.structureStats).some((stats) => (
        stats.count >= 6 && stats.independentCorrectCount / stats.count < 0.7
      ))),
  };
}
