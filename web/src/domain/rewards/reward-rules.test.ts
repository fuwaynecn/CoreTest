import { describe, expect, it } from "vitest";
import { badgeDefinitions, calculatePoints, earnedBadges } from "./reward-rules";

describe("reward rules", () => {
  it("awards the fixed points for each qualifying action", () => {
    expect(calculatePoints({
      readingCardCompleted: true,
      relationshipExplained: true,
      correctionSucceeded: true,
      firstCorrectReviewRecall: true,
      plannedSessionCompleted: true,
      elapsedSeconds: 1,
    })).toBe(16);
  });

  it("does not award points for elapsed time", () => {
    const input = { readingCardCompleted: true, elapsedSeconds: 10 };
    expect(calculatePoints(input)).toBe(calculatePoints({ ...input, elapsedSeconds: 1000 }));
  });

  it("returns badges only when deterministic counts reach their thresholds", () => {
    expect(earnedBadges({
      readingCards: 3,
      nonEmptyUnitChecks: 3,
      correctEquationItems: 5,
      correctEstimateItems: 5,
    })).toEqual(badgeDefinitions);
    expect(earnedBadges({ readingCards: 2, nonEmptyUnitChecks: 3, correctEquationItems: 4, correctEstimateItems: 5 }))
      .toEqual([badgeDefinitions[1], badgeDefinitions[3]]);
  });
});
