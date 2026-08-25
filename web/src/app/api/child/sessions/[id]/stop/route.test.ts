import { eq } from "drizzle-orm";
import { attempts, questionTemplates, reviewSchedules, rewardEvents, sessionItems, skills, trainingSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

const testState = vi.hoisted(() => ({ db: undefined as unknown, getCurrentUser: vi.fn() }));
vi.mock("@/db/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/client")>()), getDatabase: () => testState.db }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: testState.getCurrentUser }));

import { POST } from "./route";

test("marks a session completed early without clearing unanswered due reviews", async () => {
  const db = createTestDatabase();
  testState.db = db;
  testState.getCurrentUser.mockResolvedValue({ id: "child-1", role: "child" });
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values({ id: "skill-1", code: "decimal", name: "小数", domain: "number_operations" }).run();
  db.insert(questionTemplates).values({ id: "question-1", skillId: "skill-1", stem: "1+1", answerSpec: "{}", explanation: "解析", difficulty: 1 }).run();
  db.insert(trainingSessions).values({ id: "session-1", childId: "child-1", sessionDate: "2026-08-25", status: "in_progress", startedAt: 1 }).run();
  db.insert(sessionItems).values([
    { id: "item-done", sessionId: "session-1", questionTemplateId: "question-1", position: 0, stemSnapshot: "1+1", answerSpecSnapshot: "{}", explanationSnapshot: "解析", skillIdSnapshot: "skill-1", skillNameSnapshot: "小数" },
    { id: "item-due", sessionId: "session-1", questionTemplateId: "question-1", position: 1, stemSnapshot: "2+2", answerSpecSnapshot: "{}", explanationSnapshot: "解析", skillIdSnapshot: "skill-1", skillNameSnapshot: "小数" },
  ]).run();
  db.insert(attempts).values({ id: "attempt-1", sessionItemId: "item-done", clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "2", isCorrect: true, normalizedAnswer: "2", explanation: "解析", sessionCompleted: false, submittedAt: 2 }).run();
  db.insert(reviewSchedules).values({ childId: "child-1", skillId: "skill-1", level: 1, dueOn: "2026-08-25", lastResult: "incorrect", updatedAt: 1 }).run();

  const response = await POST(new Request("http://localhost/api/child/sessions/session-1/stop", { method: "POST" }), { params: Promise.resolve({ id: "session-1" }) });
  const replay = await POST(new Request("http://localhost/api/child/sessions/session-1/stop", { method: "POST" }), { params: Promise.resolve({ id: "session-1" }) });

  expect(response.status).toBe(200);
  expect(await replay.json()).toEqual({ status: "completed_early" });
  expect(db.select({ status: trainingSessions.status }).from(trainingSessions).where(eq(trainingSessions.id, "session-1")).get()).toEqual({ status: "completed_early" });
  expect(db.select().from(attempts).all()).toHaveLength(1);
  expect(db.select({ dueOn: reviewSchedules.dueOn }).from(reviewSchedules).get()).toEqual({ dueOn: "2026-08-25" });
  expect(db.select({ sourceKey: rewardEvents.sourceKey, code: rewardEvents.code, points: rewardEvents.points, attemptId: rewardEvents.attemptId })
    .from(rewardEvents).all()).toEqual([{
    sourceKey: "session-completed:session-1", code: "session-completed", points: 5, attemptId: null,
  }]);
});

test("does not overwrite an already completed session", async () => {
  const db = createTestDatabase();
  testState.db = db;
  testState.getCurrentUser.mockResolvedValue({ id: "child-1", role: "child" });
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(trainingSessions).values({ id: "completed-session", childId: "child-1", sessionDate: "2026-08-25", status: "completed", startedAt: 1, completedAt: 99 }).run();

  const response = await POST(new Request("http://localhost/api/child/sessions/completed-session/stop", { method: "POST" }), { params: Promise.resolve({ id: "completed-session" }) });

  expect(await response.json()).toEqual({ status: "completed" });
  expect(db.select({ status: trainingSessions.status, completedAt: trainingSessions.completedAt }).from(trainingSessions).where(eq(trainingSessions.id, "completed-session")).get()).toEqual({ status: "completed", completedAt: 99 });
});
