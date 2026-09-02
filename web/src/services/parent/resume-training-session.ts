import { and, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { trainingSessions } from "@/db/schema";

export function resumeCurrentTrainingSession(db: AppDatabase, childId: string, sessionId: string, date: string) {
  const result = db.update(trainingSessions).set({ status: "in_progress", completedAt: null }).where(and(
    eq(trainingSessions.id, sessionId),
    eq(trainingSessions.childId, childId),
    eq(trainingSessions.sessionDate, date),
    inArray(trainingSessions.kind, ["daily", "assessment"]),
    eq(trainingSessions.status, "completed_early"),
  )).run();
  return result.changes > 0;
}
