import { addShanghaiDays, shanghaiWeekKey } from "@/domain/time/shanghai-calendar";

export type PlanCategory = "weakness" | "review" | "reading" | "extension";
export type WeeklyTarget = {
  key: string;
  skillId: string | null;
  track: "computation" | "equation" | null;
  category: PlanCategory;
  minimum: number;
  target: number;
  maximum: number;
  reasonCode: string;
};
export type PlanWeek = {
  week: 1 | 2 | 3 | 4 | 5 | 6;
  trainingDays: 5;
  assessment: boolean;
  replanAfter: boolean;
  targets: WeeklyTarget[];
};
export type SixWeekPlanDraft = {
  startsOn: string;
  endsOn: string;
  weeks: PlanWeek[];
  reasonSnapshot: string;
};

export type BuildSixWeekPlanInput = {
  startsOn: string;
  diagnosis: { id: string; report: unknown };
  mastery: readonly {
    skillId: string;
    status: "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
    evidenceCount: number;
    track: "computation" | "equation" | null;
  }[];
  dosage: readonly {
    track: "computation" | "equation";
    minimum: number;
    target: number;
    maximum: number;
  }[];
  dueReviews: readonly { skillId: string; dueOn: string }[];
  preferences: { specialistFocus: "none" | "computation" | "equation" | "reading" };
};

const masteryRank = { needs_support: 0, learning: 1, basic: 2, stable: 3, undiagnosed: 4 } as const;

function targets(input: BuildSixWeekPlanInput): WeeklyTarget[] {
  const dueOn = new Map(input.dueReviews.map((review) => [review.skillId, review.dueOn]));
  const weaknesses = [...input.mastery].sort((left, right) => (
    masteryRank[left.status] - masteryRank[right.status]
    || (dueOn.get(left.skillId) ?? "9999-12-31").localeCompare(dueOn.get(right.skillId) ?? "9999-12-31")
    || left.evidenceCount - right.evidenceCount
    || left.skillId.localeCompare(right.skillId)
  )).map((skill): WeeklyTarget => ({
    key: `weakness:${skill.skillId}`, skillId: skill.skillId, track: skill.track,
    category: "weakness", minimum: 1, target: 2, maximum: 3, reasonCode: `mastery_${skill.status}`,
  }));
  const reviews = [...input.dueReviews].sort((left, right) => (
    left.dueOn.localeCompare(right.dueOn) || left.skillId.localeCompare(right.skillId)
  )).map((review): WeeklyTarget => ({
    key: `review:${review.skillId}`, skillId: review.skillId, track: null,
    category: "review", minimum: 1, target: 1, maximum: 2, reasonCode: "due_review",
  }));
  const dosage = [...input.dosage].sort((left, right) => left.track.localeCompare(right.track))
    .map((state): WeeklyTarget => {
      const focused = input.preferences.specialistFocus === state.track ? 15 : 0;
      return {
        key: state.track, skillId: null, track: state.track, category: "weakness",
        minimum: state.minimum, target: state.target + focused, maximum: state.maximum + focused,
        reasonCode: focused ? "parent_specialist_focus" : "dosage_state",
      };
    });
  const readingIncrease = input.preferences.specialistFocus === "reading" ? 15 : 0;
  return [...dosage, ...weaknesses, ...reviews, {
    key: "reading", skillId: null, track: null, category: "reading", minimum: 0,
    target: 20 + readingIncrease, maximum: 25 + readingIncrease,
    reasonCode: readingIncrease ? "parent_specialist_focus" : "reading_practice",
  }];
}

export function buildSixWeekPlan(input: BuildSixWeekPlanInput): SixWeekPlanDraft {
  const startsOn = shanghaiWeekKey(new Date(`${input.startsOn}T12:00:00+08:00`));
  const planTargets = targets(input);
  return {
    startsOn,
    endsOn: addShanghaiDays(startsOn, 41),
    weeks: Array.from({ length: 6 }, (_, index) => ({
      week: (index + 1) as PlanWeek["week"], trainingDays: 5,
      assessment: index === 3, replanAfter: index === 5,
      targets: planTargets.map((target) => ({ ...target })),
    })),
    reasonSnapshot: JSON.stringify({ diagnosisId: input.diagnosis.id, specialistFocus: input.preferences.specialistFocus }),
  };
}
