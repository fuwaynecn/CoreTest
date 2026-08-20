import { deriveDosageState, type TrackSessionSummary } from "./derive-dosage";

function session(
  on: string,
  rate: number,
  overrides: Partial<TrackSessionSummary> = {},
): TrackSessionSummary {
  return {
    sessionId: `session-${on}`,
    on,
    independentCorrectCount: rate,
    totalCount: 100,
    highestHintLevel: 0,
    dueReviewOutcome: null,
    structureStats: {},
    ...overrides,
  };
}

test("advances computation after two qualifying cross-day sessions", () => {
  expect(deriveDosageState({
    track: "computation",
    sessions: [
      session("2026-08-20", 90),
      session("2026-08-21", 95, { dueReviewOutcome: "passed" }),
    ],
  })).toMatchObject({
    track: "computation", level: 2, weeklyTarget: 60,
    sessionMin: 12, sessionTarget: 15, sessionMax: 19,
    reasonCode: "advance", sameStructureCap: 6,
  });
});

test("same-day evidence is insufficient and level-one hints do not block advancement", () => {
  expect(deriveDosageState({
    track: "equation",
    sessions: [
      session("2026-08-20", 100),
      session("2026-08-20", 100, { sessionId: "same-day-2" }),
    ],
  })).toMatchObject({ level: 1, reasonCode: "insufficient_evidence" });
  expect(deriveDosageState({
    track: "equation",
    sessions: [
      session("2026-08-20", 90, { highestHintLevel: 1 }),
      session("2026-08-21", 90, { highestHintLevel: 1, dueReviewOutcome: "passed" }),
    ],
  })).toMatchObject({ level: 2, reasonCode: "advance" });
});

test("level-two hints, corrections, and failed due reviews cannot advance complexity", () => {
  expect(deriveDosageState({
    track: "equation",
    current: { level: 3, weeklyTarget: 18, sessionMin: 4, sessionTarget: 5, sessionMax: 6 },
    sessions: [
      session("2026-08-20", 95, { highestHintLevel: 2 }),
      session("2026-08-21", 95, { dueReviewOutcome: "passed" }),
    ],
  })).toMatchObject({ level: 3, weeklyTarget: 18, reasonCode: "hold" });
  expect(deriveDosageState({
    track: "equation",
    current: { level: 3, weeklyTarget: 18, sessionMin: 4, sessionTarget: 5, sessionMax: 6 },
    sessions: [
      session("2026-08-20", 95),
      session("2026-08-21", 95, { dueReviewOutcome: "failed" }),
    ],
  })).toMatchObject({ level: 2, weeklyTarget: 18, reasonCode: "support" });
});

test("70 to 89 percent holds level and volume", () => {
  expect(deriveDosageState({
    track: "computation",
    current: { level: 4, weeklyTarget: 72, sessionMin: 12, sessionTarget: 16, sessionMax: 19 },
    sessions: [session("2026-08-20", 89), session("2026-08-21", 70)],
  })).toMatchObject({
    level: 4, weeklyTarget: 72, sessionMin: 12, sessionTarget: 16,
    sessionMax: 19, reasonCode: "hold",
  });
});

test("only a capped structure below 70 percent suggests parent intervention", () => {
  expect(deriveDosageState({
    track: "computation",
    current: { level: 4, weeklyTarget: 72, sessionMin: 12, sessionTarget: 16, sessionMax: 19 },
    sessions: [
      session("2026-08-20", 92),
      session("2026-08-21", 69, {
        structureStats: { decimal: { count: 6, independentCorrectCount: 4 } },
      }),
    ],
  })).toEqual({
    track: "computation", level: 3, weeklyTarget: 72,
    sessionMin: 12, sessionTarget: 16, sessionMax: 19,
    reasonCode: "support", sameStructureCap: 6, parentInterventionSuggested: true,
  });
  expect(deriveDosageState({
    track: "computation",
    current: { level: 4, weeklyTarget: 72, sessionMin: 12, sessionTarget: 16, sessionMax: 19 },
    sessions: [
      session("2026-08-20", 100),
      session("2026-08-21", 100, {
        structureStats: { decimal: { count: 6, independentCorrectCount: 6 } },
      }),
    ],
  })).toMatchObject({ parentInterventionSuggested: false });
});

test("track levels and approved target ranges stay bounded", () => {
  const equation = deriveDosageState({
    track: "equation",
    current: { level: 6, weeklyTarget: 20, sessionMin: 4, sessionTarget: 6, sessionMax: 6 },
    sessions: [
      session("2026-08-20", 100),
      session("2026-08-21", 100, { dueReviewOutcome: "passed" }),
    ],
  });
  const computation = deriveDosageState({
    track: "computation",
    current: { level: 7, weeklyTarget: 95, sessionMin: 12, sessionTarget: 19, sessionMax: 19 },
    sessions: [
      session("2026-08-20", 100),
      session("2026-08-21", 100, { dueReviewOutcome: "passed" }),
    ],
  });
  expect(equation).toMatchObject({ level: 6, weeklyTarget: 20, sessionMin: 4, sessionMax: 6 });
  expect(computation).toMatchObject({ level: 7, weeklyTarget: 95, sessionMin: 12, sessionMax: 19 });
});

test("high cross-day training holds until a due review is passed", () => {
  expect(deriveDosageState({
    track: "computation",
    sessions: [session("2026-08-20", 100), session("2026-08-21", 100)],
  })).toMatchObject({ level: 1, reasonCode: "hold" });
});

test("same-day sessions aggregate numerator and denominator before one transition", () => {
  expect(deriveDosageState({
    track: "computation",
    current: { level: 3, weeklyTarget: 72, sessionMin: 12, sessionTarget: 16, sessionMax: 19 },
    sessions: [
      session("2026-08-20", 100),
      session("2026-08-21", 0, { sessionId: "day-2-low" }),
      session("2026-08-21", 100, {
        sessionId: "day-2-high", dueReviewOutcome: "passed",
      }),
    ],
  })).toMatchObject({ level: 2, reasonCode: "support" });
});

test("same-day failed review and high hint dominate a later passing session", () => {
  expect(deriveDosageState({
    track: "equation",
    current: { level: 3, weeklyTarget: 18, sessionMin: 4, sessionTarget: 5, sessionMax: 6 },
    sessions: [
      session("2026-08-20", 100),
      session("2026-08-21", 100, {
        sessionId: "day-2-failed", highestHintLevel: 2, dueReviewOutcome: "failed",
      }),
      session("2026-08-21", 100, {
        sessionId: "day-2-passed", dueReviewOutcome: "passed",
      }),
    ],
  })).toMatchObject({ level: 2, reasonCode: "support" });
});
