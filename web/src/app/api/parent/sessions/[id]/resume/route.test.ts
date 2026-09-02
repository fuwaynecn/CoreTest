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

test("allows a parent to resume today's early-ended session", async () => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" });
  db.insert(users).values({ id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(trainingSessions).values({ id: "today", childId: "child", sessionDate: shanghaiDateKey(), kind: "daily", status: "completed_early", startedAt: 1, completedAt: 2 }).run();

  const response = await POST(new Request("http://localhost/api/parent/sessions/today/resume", { method: "POST" }), { params: Promise.resolve({ id: "today" }) });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "in_progress" });
  expect(db.select({ status: trainingSessions.status }).from(trainingSessions).where(eq(trainingSessions.id, "today")).get()).toEqual({ status: "in_progress" });
});

test("protects the parent-only resume endpoint", async () => {
  state.getCurrentUser.mockResolvedValue({ id: "child", role: "child", displayName: "孩子" });
  const response = await POST(new Request("http://localhost/api/parent/sessions/today/resume", { method: "POST" }), { params: Promise.resolve({ id: "today" }) });
  expect(response.status).toBe(403);
});
