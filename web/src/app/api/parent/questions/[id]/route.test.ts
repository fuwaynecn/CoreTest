import { questionInstances, questionTemplates, skills, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({ db: undefined as ReturnType<typeof createTestDatabase> | undefined, user: null as { id: string; role: "parent" | "child"; displayName: string } | null }));
vi.mock("@/db/client", async (original) => ({ ...(await original<typeof import("@/db/client")>()), getDatabase: () => state.db }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => state.user }));
import { PATCH } from "./route";

function parentRequest(body: unknown) {
  return new Request("http://localhost/api/parent/questions/instance-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
const valid = { stem: "3 + 4 = ?", answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null }, explanation: "正确答案", skillId: "skill-integer-mental", difficulty: 1, active: true };

beforeEach(() => {
  state.db = createTestDatabase();
  state.user = { id: "parent-1", role: "parent", displayName: "家长" };
  state.db.insert(users).values([
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "x", createdAt: 1 },
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "x", createdAt: 1 },
  ]).run();
  state.db.insert(skills).values({ id: "skill-integer-mental", code: "integer", name: "整数", domain: "number_operations" }).run();
  state.db.insert(questionTemplates).values({ id: "template-1", skillId: "skill-integer-mental", domain: "number_operations", answerMode: "written", stem: "模板", answerSpec: JSON.stringify(valid.answerSpec), explanation: "解析", difficulty: 1 }).run();
  state.db.insert(questionInstances).values({ id: "instance-1", templateId: "template-1", skillId: "skill-integer-mental", variantSeed: "seed", variables: "{}", stem: "1 + 1 = ?", answerSpec: JSON.stringify({ kind: "number", value: 2, tolerance: 0, unit: null }), explanation: "2", difficulty: 1, fingerprint: "fp-1", active: true, generatedAt: 1, updatedAt: 1, lastUsedAt: null }).run();
});

test.each([
  [null, 401],
  [{ id: "child-1", role: "child", displayName: "孩子" }, 403],
] as const)("protects parent question editing", async (user, status) => {
  state.user = user;
  expect((await PATCH(parentRequest(valid), { params: Promise.resolve({ id: "instance-1" }) })).status).toBe(status);
});

test("returns 404 for a missing instance", async () => {
  const response = await PATCH(parentRequest(valid), { params: Promise.resolve({ id: "missing" }) });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: { code: "question_not_found" } });
});

test.each([
  { ...valid, stem: "3 + 4 = ?", answerSpec: { kind: "number", value: 8, tolerance: 0, unit: null }, explanation: "错误答案" },
  { ...valid, stem: "", explanation: "解析" },
  { ...valid, answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null }, skillId: "unknown-skill" },
])("rejects invalid edited content", async (body) => {
  const response = await PATCH(parentRequest(body), { params: Promise.resolve({ id: "instance-1" }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
});
