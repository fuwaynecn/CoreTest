export const pointValues = {
  readingCardCompleted: 2,
  relationshipExplained: 1,
  correctionSucceeded: 3,
  firstCorrectReviewRecall: 5,
  plannedSessionCompleted: 5,
} as const;

export type PointQualifiers = Partial<Record<keyof typeof pointValues, boolean>> & {
  elapsedSeconds?: number;
};

export function calculatePoints(qualifiers: PointQualifiers): number {
  return (Object.keys(pointValues) as Array<keyof typeof pointValues>)
    .reduce((total, key) => total + (qualifiers[key] ? pointValues[key] : 0), 0);
}

export const badgeDefinitions = [
  { code: "reading-detective", label: "审题侦探", threshold: 3, count: "readingCards" },
  { code: "unit-inspector", label: "单位检查员", threshold: 3, count: "nonEmptyUnitChecks" },
  { code: "equation-balancer", label: "方程平衡师", threshold: 5, count: "correctEquationItems" },
  { code: "estimate-expert", label: "估算能手", threshold: 5, count: "correctEstimateItems" },
] as const;

export type BadgeDefinition = (typeof badgeDefinitions)[number];

export type BadgeCounts = {
  readingCards: number;
  nonEmptyUnitChecks: number;
  correctEquationItems: number;
  correctEstimateItems: number;
};

export function earnedBadges(counts: BadgeCounts): BadgeDefinition[] {
  return badgeDefinitions.filter((badge) => counts[badge.count] >= badge.threshold);
}
