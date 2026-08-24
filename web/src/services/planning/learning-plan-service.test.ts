import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/test-db";
import {
  diagnosticRuns, dosageStates, learningPlans, masteryStates, parentPreferences,
  planTargets, reviewSchedules, skills, trainingSessions, users,
} from "@/db/schema";
import {
  LearningPlanStateError, createInitialPlan, reviseActivePlan, rollPlanAfterWeekSix,
} from "./learning-plan-service";

function seed() {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values([
    { id: "skill-equation", code: "equation", name: "方程", domain: "equation_algebra" },
    { id: "skill-computation", code: "decimal", name: "小数", domain: "number_operations" },
  ]).run();
  db.insert(diagnosticRuns).values({
    id: "diagnosis-1", childId: "child-1", version: 1, status: "completed", currentPart: 3,
    seed: "seed", reportSnapshot: JSON.stringify({ version: 1 }), startedAt: 1, completedAt: 2,
  }).run();
  db.insert(masteryStates).values([
    { childId: "child-1", skillId: "skill-equation", status: "needs_support", evidenceCount: 3, correctCount: 1, reasonCode: "diagnostic_needs_support", evidenceVersion: 1, updatedAt: 2 },
    { childId: "child-1", skillId: "skill-computation", status: "learning", evidenceCount: 8, correctCount: 5, reasonCode: "diagnostic_learning", evidenceVersion: 1, updatedAt: 2 },
  ]).run();
  db.insert(dosageStates).values([
    { childId: "child-1", track: "computation", level: 1, weeklyTarget: 60, sessionMinimum: 12, sessionTarget: 15, sessionMaximum: 19, reasonJson: "{}", updatedAt: 2 },
    { childId: "child-1", track: "equation", level: 1, weeklyTarget: 15, sessionMinimum: 4, sessionTarget: 5, sessionMaximum: 6, reasonJson: "{}", updatedAt: 2 },
  ]).run();
  db.insert(reviewSchedules).values({ childId: "child-1", skillId: "skill-computation", level: 0, dueOn: "2026-08-24", lastResult: null, updatedAt: 2 }).run();
  db.insert(parentPreferences).values({ childId: "child-1", trainingWeekdays: "[1,2,3,4,5]", targetMinutes: 30, specialistFocus: "none", updatedAt: 2 }).run();
  return db;
}

describe("learning plan service", () => {
  it("requires a completed diagnosis before creating a plan", () => {
    const db = createTestDatabase();
    db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();

    expect(() => createInitialPlan(db, "child-1", new Date("2026-08-23T16:00:00Z"), 3)).toThrow(LearningPlanStateError);
  });

  it("creates one initial plan transactionally and returns it to concurrent duplicate callers", () => {
    const db = seed();
    const now = new Date("2026-08-23T16:00:00Z");
    const first = createInitialPlan(db, "child-1", now, 3);
    const duplicate = createInitialPlan(db, "child-1", now, 3);

    expect(duplicate.id).toBe(first.id);
    expect(first).toMatchObject({ version: 1, revision: 1, startsOn: "2026-08-24", endsOn: "2026-10-04", status: "active" });
    expect(db.select().from(learningPlans).all()).toHaveLength(1);
    expect(db.select().from(planTargets).where(eq(planTargets.planId, first.id)).all()).not.toHaveLength(0);
  });

  it("supersedes only the active revision and retains historical targets", () => {
    const db = seed();
    const initial = createInitialPlan(db, "child-1", new Date("2026-08-23T16:00:00Z"), 3);
    db.insert(trainingSessions).values({
      id: "generated-session", childId: "child-1", sessionDate: "2026-08-24", kind: "daily",
      learningPlanId: initial.id, planRevision: initial.revision, status: "in_progress", startedAt: 3,
    }).run();
    const revised = reviseActivePlan(db, "child-1", { specialistFocus: "reading" }, 4);

    expect(revised).toMatchObject({ version: 1, revision: 2, status: "active" });
    expect(db.select().from(learningPlans).orderBy(learningPlans.revision).all())
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: initial.id, status: "superseded", revision: 1 }),
        expect.objectContaining({ id: revised.id, status: "active", revision: 2 }),
    ]));
    expect(db.select().from(planTargets).where(eq(planTargets.planId, initial.id)).all()).not.toHaveLength(0);
    expect(db.select().from(trainingSessions).where(eq(trainingSessions.id, "generated-session")).get())
      .toMatchObject({ learningPlanId: initial.id, planRevision: 1 });
  });

  it("completes week six and starts the next Monday as version two", () => {
    const db = seed();
    const initial = createInitialPlan(db, "child-1", new Date("2026-08-23T16:00:00Z"), 3);
    const rolled = rollPlanAfterWeekSix(db, "child-1", new Date("2026-10-04T16:00:00Z"), 4);

    expect(rolled).toMatchObject({ version: 2, revision: 1, startsOn: "2026-10-05", endsOn: "2026-11-15", status: "active" });
    expect(db.select().from(learningPlans).where(eq(learningPlans.id, initial.id)).get()).toMatchObject({ status: "completed" });
  });
});
