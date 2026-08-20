import { addShanghaiDays } from "@/domain/time/shanghai-calendar";

export const REVIEW_DAYS = [1, 3, 7, 14, 30] as const;
export type ReviewLevel = 0 | 1 | 2 | 3 | 4;
export type ReviewOutcome = "independent_correct" | "hinted_correct" | "corrected" | "incorrect";

export type ReviewState = {
  level: ReviewLevel;
  dueOn: string;
  lastResult: ReviewOutcome;
};

export function nextReviewState(input: {
  level: ReviewLevel;
  outcome: ReviewOutcome;
  on: string;
}): ReviewState {
  const level = input.outcome === "independent_correct"
    ? Math.min(input.level + 1, 4) as ReviewLevel
    : input.outcome === "incorrect"
      ? 0
      : Math.max(input.level - 1, 0) as ReviewLevel;
  return {
    level,
    dueOn: addShanghaiDays(input.on, REVIEW_DAYS[level]),
    lastResult: input.outcome,
  };
}

