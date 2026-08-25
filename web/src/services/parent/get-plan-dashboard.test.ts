import { expect, test } from "vitest";
import { createTestDatabase } from "@/test/test-db";
import { diagnosticRuns, learningPlans, parentPreferences, users } from "@/db/schema";
import { getPlanDashboard } from "./get-plan-dashboard";

test("returns six weeks and a non-persisting seven-day rest preview", () => {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(diagnosticRuns).values({ id: "diagnosis", childId: "child", version: 1, status: "completed", currentPart: 3, seed: "seed", startedAt: 1, completedAt: 2 }).run();
  db.insert(learningPlans).values({ id: "plan", childId: "child", diagnosisRunId: "diagnosis", version: 1, revision: 2, status: "active", startsOn: "2026-08-24", endsOn: "2026-10-04", reasonSnapshot: "{}", createdAt: 1 }).run();
  db.insert(parentPreferences).values({ childId: "child", trainingWeekdays: "[1,2,3,4,6]", targetMinutes: 30, specialistFocus: "equation", updatedAt: 1 }).run();
  const before = db.select().from(learningPlans).all().length;
  const view = getPlanDashboard(db, "child", new Date("2026-08-24T04:00:00Z"));
  expect(view.plan).toMatchObject({ version: 1, revision: 2, currentWeek: 1 });
  expect(view.plan?.weeks).toHaveLength(6);
  expect(view.nextSevenDays).toHaveLength(7);
  expect(view.nextSevenDays.find((day) => day.date === "2026-08-28")?.kind).toBe("rest");
  expect(db.select().from(learningPlans).all()).toHaveLength(before);
});
