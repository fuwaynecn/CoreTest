import { describe, expect, it } from "vitest";
import { buildSixWeekPlan, type BuildSixWeekPlanInput } from "./build-six-week-plan";

function fixtureInput(overrides: Partial<BuildSixWeekPlanInput> = {}): BuildSixWeekPlanInput {
  return {
    startsOn: "2026-08-24",
    diagnosis: { id: "diagnosis-1", report: { version: 1 } },
    mastery: [
      { skillId: "skill-equation", status: "needs_support", evidenceCount: 3, track: "equation" },
      { skillId: "skill-computation", status: "learning", evidenceCount: 8, track: "computation" },
    ],
    dosage: [
      { track: "computation", minimum: 12, target: 15, maximum: 19 },
      { track: "equation", minimum: 15, target: 18, maximum: 20 },
    ],
    dueReviews: [{ skillId: "skill-computation", dueOn: "2026-08-24" }],
    preferences: { specialistFocus: "none" },
    ...overrides,
  };
}

describe("buildSixWeekPlan", () => {
  it("builds the six Monday-to-Sunday weeks with assessment and replan boundaries", () => {
    const draft = buildSixWeekPlan(fixtureInput());

    expect(draft.endsOn).toBe("2026-10-04");
    expect(draft.weeks).toHaveLength(6);
    expect(draft.weeks[3].assessment).toBe(true);
    expect(draft.weeks[5].replanAfter).toBe(true);
    expect(draft.weeks.every((week) => week.trainingDays === 5)).toBe(true);
    expect(draft.weeks[0].targets.find((target) => target.key === "equation"))
      .toMatchObject({ minimum: 15, target: 18, maximum: 20 });
  });

  it("prioritizes weakest skills, retains due-review minimums, and deterministically orders ties", () => {
    const draft = buildSixWeekPlan(fixtureInput({
      mastery: [
        { skillId: "skill-z", status: "needs_support", evidenceCount: 3, track: null },
        { skillId: "skill-a", status: "needs_support", evidenceCount: 3, track: null },
        { skillId: "skill-basic", status: "basic", evidenceCount: 1, track: null },
      ],
      dueReviews: [
        { skillId: "skill-z", dueOn: "2026-08-25" },
        { skillId: "skill-a", dueOn: "2026-08-25" },
      ],
    }));
    const targets = draft.weeks[0].targets;

    expect(targets.filter((target) => target.category === "weakness" && target.skillId !== null).map((target) => target.skillId))
      .toEqual(["skill-a", "skill-z", "skill-basic"]);
    expect(targets.filter((target) => target.category === "review"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ skillId: "skill-a", minimum: 1 }),
        expect.objectContaining({ skillId: "skill-z", minimum: 1 }),
      ]));
  });

  it("adds fifteen points to a reading focus without removing review coverage", () => {
    const normal = buildSixWeekPlan(fixtureInput());
    const focused = buildSixWeekPlan(fixtureInput({ preferences: { specialistFocus: "reading" } }));
    const normalReading = normal.weeks[0].targets.find((target) => target.key === "reading")!;
    const focusedReading = focused.weeks[0].targets.find((target) => target.key === "reading")!;

    expect(focusedReading.target).toBe(normalReading.target + 15);
    expect(focused.weeks[0].targets.some((target) => target.category === "review" && target.minimum > 0)).toBe(true);
  });

  it("returns identical output for identical input", () => {
    const input = fixtureInput();
    expect(buildSixWeekPlan(input)).toEqual(buildSixWeekPlan(input));
  });
});
