export type DosageTrack = "computation" | "equation";
export type DosageReasonCode = "advance" | "hold" | "support" | "insufficient_evidence";

export type TrackSessionSummary = {
  sessionId: string;
  on: string;
  independentCorrectCount: number;
  totalCount: number;
  highestHintLevel: 0 | 1 | 2 | 3 | null;
  dueReviewOutcome: "passed" | "failed" | null;
  sameStructureMaxCount: number;
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

function latestDistinctDays(sessions: readonly TrackSessionSummary[]) {
  const latestByDay = new Map<string, TrackSessionSummary>();
  for (const summary of sessions) latestByDay.set(summary.on, summary);
  return [...latestByDay.values()]
    .sort((left, right) => left.on.localeCompare(right.on))
    .slice(-2);
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
      && recent.some((summary) => summary.sameStructureMaxCount >= 6),
  };
}
