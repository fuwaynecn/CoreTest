import { errorObservations, questionTemplates, sessionItems, skills, trainingSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { submitAttempt } from "@/services/training/submit-attempt";

const state = vi.hoisted(() => ({ db: undefined as unknown, getCurrentUser: vi.fn() }));
vi.mock("@/db/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/db/client")>()), getDatabase: () => state.db }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: state.getCurrentUser }));
import { PATCH } from "./route";

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockReset();
  state.getCurrentUser.mockResolvedValue({ id: "parent-1", role: "parent", displayName: "家长" });
  db.insert(users).values([
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "x", createdAt: 1 },
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "x", createdAt: 1 },
  ]).run();
  db.insert(skills).values({ id: "skill-1", code: "s", name: "能力", domain: "number_operations" }).run();
  db.insert(questionTemplates).values({ id: "template-1", skillId: "skill-1", stem: "1+1", answerSpec: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }), explanation: "2", difficulty: 1 }).run();
  db.insert(trainingSessions).values({ id: "session-1", childId: "child-1", sessionDate: "2026-08-20", kind: "daily", status: "in_progress", startedAt: 1 }).run();
  db.insert(sessionItems).values({
    id: "item-1", sessionId: "session-1", questionTemplateId: "template-1", position: 0,
    stemSnapshot: "1+1", answerSpecSnapshot: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }), explanationSnapshot: "2",
    skillIdSnapshot: "skill-1", skillNameSnapshot: "能力", selectionReasonSnapshot: JSON.stringify({ commonErrors: ["calculation"] }),
  }).run();
  submitAttempt(db, { childId: "child-1", sessionItemId: "item-1", clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "3" });
});

function request(id: string, body: unknown) {
  return PATCH(new Request(`http://localhost/api/parent/error-observations/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

test("appends a parent revision and replays an identical retry", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  const root = db.select().from(errorObservations).get()!;
  expect((await request(root.id, { cause: "relationship" })).status).toBe(200);
  expect((await request(root.id, { cause: "relationship" })).status).toBe(200);
  expect(db.select().from(errorObservations).all()).toHaveLength(2);
});

test.each([
  { user: null, status: 401, code: "authentication_required" },
  { user: { id: "child-1", role: "child", displayName: "孩子" }, status: 403, code: "parent_access_required" },
])("protects the parent correction endpoint", async ({ user, status, code }) => {
  state.getCurrentUser.mockResolvedValue(user);
  const response = await request("missing", { cause: "unknown" });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code } });
});

test("returns structured validation and not-found responses", async () => {
  const invalid = await request("missing", { cause: "guess" });
  expect(invalid.status).toBe(400);
  const missing = await request("missing", { cause: "unknown" });
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({ error: { code: "observation_not_found" } });
});
