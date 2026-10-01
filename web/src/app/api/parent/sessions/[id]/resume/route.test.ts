import { eq } from "drizzle-orm";
import { trainingSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";

const state = vi.hoisted(() => ({ db: undefined as unknown, getCurrentUser: vi.fn() }));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => state.db };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: state.getCurrentUser }));

import { POST } from "./route";

function postResume(sessionId: string, childId: string = "child") {
  return POST(new Request(`http://localhost/api/parent/sessions/${sessionId}/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ childId }),
  }), { params: Promise.resolve({ id: sessionId }) });
}

test("allows a parent to resume today's early-ended session", async () => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" });
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
    { id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1, parentId: "parent" },
  ]).run();
  db.insert(trainingSessions).values({ id: "today", childId: "child", sessionDate: shanghaiDateKey(), kind: "daily", status: "completed_early", startedAt: 1, completedAt: 2 }).run();

  const response = await postResume("today");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "in_progress" });
  expect(db.select({ status: trainingSessions.status }).from(trainingSessions).where(eq(trainingSessions.id, "today")).get()).toEqual({ status: "in_progress" });
});

test("protects the parent-only resume endpoint", async () => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" });
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
    { id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1, parentId: "parent" },
  ]).run();
  db.insert(trainingSessions).values({ id: "today", childId: "child", sessionDate: shanghaiDateKey(), kind: "daily", status: "completed_early", startedAt: 1, completedAt: 2 }).run();

  state.getCurrentUser.mockResolvedValue({ id: "child", role: "child", displayName: "孩子" });
  const response = await postResume("today");
  expect(response.status).toBe(403);
});

test("rejects a child owned by another parent with 403 and does not resume", async () => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" });
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
    { id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1, parentId: "parent" },
    { id: "parent-other", role: "parent", displayName: "别家", credentialHash: "hash", createdAt: 1 },
    { id: "child-other", role: "child", displayName: "别家孩子", credentialHash: "hash", createdAt: 1, parentId: "parent-other" },
  ]).run();
  db.insert(trainingSessions).values([
    { id: "today", childId: "child", sessionDate: shanghaiDateKey(), kind: "daily", status: "completed_early", startedAt: 1, completedAt: 2 },
    { id: "other-today", childId: "child-other", sessionDate: shanghaiDateKey(), kind: "daily", status: "completed_early", startedAt: 1, completedAt: 2 },
  ]).run();

  const response = await postResume("other-today", "child-other");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "not_your_child" } });

  // Other family's session should remain completed_early
  const otherSession = db.select({ status: trainingSessions.status }).from(trainingSessions).where(eq(trainingSessions.id, "other-today")).get();
  expect(otherSession?.status).toBe("completed_early");
});
