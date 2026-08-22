import { nextReviewState } from "./next-review";

test.each([
  [0, "independent_correct", 1, "2026-08-23"],
  [1, "independent_correct", 2, "2026-08-27"],
  [2, "independent_correct", 3, "2026-09-03"],
  [3, "independent_correct", 4, "2026-09-19"],
  [4, "independent_correct", 4, "2026-09-19"],
] as const)("advances review level %i after an independent answer", (level, outcome, next, dueOn) => {
  expect(nextReviewState({ level, outcome, on: "2026-08-20" })).toEqual({
    level: next, dueOn, lastResult: outcome,
  });
});

test.each([
  [3, "hinted_correct", 2, "2026-08-27"],
  [1, "corrected", 0, "2026-08-21"],
  [0, "hinted_correct", 0, "2026-08-21"],
] as const)("reduces review level after supported result", (level, outcome, next, dueOn) => {
  expect(nextReviewState({ level, outcome, on: "2026-08-20" })).toEqual({
    level: next, dueOn, lastResult: outcome,
  });
});

test("resets an incorrect review to tomorrow", () => {
  expect(nextReviewState({ level: 4, outcome: "incorrect", on: "2026-08-20" }))
    .toEqual({ level: 0, dueOn: "2026-08-21", lastResult: "incorrect" });
});

test.each([
  ["2026-08-31", "2026-09-03"],
  ["2026-12-31", "2027-01-03"],
  ["2028-02-28", "2028-03-02"],
] as const)("uses Shanghai calendar days across %s", (on, dueOn) => {
  expect(nextReviewState({ level: 0, outcome: "independent_correct", on })).toEqual({
    level: 1, dueOn, lastResult: "independent_correct",
  });
});
