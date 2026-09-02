import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { trainingSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { resumeCurrentTrainingSession } from "./resume-training-session";

test("restores only today's early-ended formal session", () => {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(trainingSessions).values([
    { id: "today", childId: "child", sessionDate: "2026-09-02", kind: "daily", status: "completed_early", startedAt: 1, completedAt: 2 },
    { id: "complete", childId: "child", sessionDate: "2026-09-01", kind: "daily", status: "completed", startedAt: 1, completedAt: 2 },
  ]).run();

  expect(resumeCurrentTrainingSession(db, "child", "today", "2026-09-02")).toBe(true);
  expect(db.select({ status: trainingSessions.status, completedAt: trainingSessions.completedAt }).from(trainingSessions).where(eq(trainingSessions.id, "today")).get())
    .toEqual({ status: "in_progress", completedAt: null });
  expect(resumeCurrentTrainingSession(db, "child", "complete", "2026-09-02")).toBe(false);
});
