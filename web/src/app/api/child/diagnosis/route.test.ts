import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { questionTemplates, skills, users } from "@/db/schema";
import { instantiateTemplate } from "@/domain/questions/instantiate-template";
import { getOrCreateDiagnosis } from "@/services/diagnosis/diagnosis-service";
import { createTestDatabase } from "@/test/test-db";

const testState = vi.hoisted(() => ({ db: undefined as unknown, getCurrentUser: vi.fn() }));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => testState.db };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: testState.getCurrentUser }));

import { GET, POST } from "./route";

let db: ReturnType<typeof createTestDatabase>;

beforeEach(() => {
  testState.getCurrentUser.mockReset();
  testState.getCurrentUser.mockResolvedValue({ id: "child-1", role: "child", displayName: "孩子" });
  db = createTestDatabase();
  testState.db = db;
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values(phase2Skills).run();
  db.insert(questionTemplates).values(phase2Catalog.map((template) => {
    const instance = instantiateTemplate(template, `seed:${template.id}`);
    return {
      id: template.id, skillId: `skill-${template.skillCode}`, domain: template.domain,
      contentTier: template.contentTier, structureTag: template.structureTag,
      estimatedSeconds: template.estimatedSeconds, readingLoad: template.readingLoad,
      answerMode: template.answerMode, variantSpec: JSON.stringify(template.variantSpec),
      hintLadder: JSON.stringify(template.hintLadder), stem: instance.stem,
      answerSpec: JSON.stringify(instance.answerSpec), explanation: instance.explanation,
      difficulty: template.difficulty, active: true,
    };
  })).run();
});

function request(body: unknown) {
  return new Request("http://localhost/api/child/diagnosis", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

test.each([
  { method: "GET", user: null, status: 401, error: "Authentication required" },
  { method: "POST", user: { id: "parent", role: "parent" }, status: 403, error: "Child access required" },
])("returns child-only JSON for $method", async ({ method, user, status, error }) => {
  testState.getCurrentUser.mockResolvedValue(user);
  const response = method === "GET" ? await GET() : await POST(request({}));
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(await response.json()).toEqual({ error });
});

test("GET creates and returns the resumable diagnosis view", async () => {
  const first = await GET();
  const second = await GET();
  expect(first.status).toBe(200);
  expect((await first.json()).currentItem.id).toBe((await second.json()).currentItem.id);
});

test("POST validates the command and returns the next diagnosis item", async () => {
  const diagnosis = getOrCreateDiagnosis(db, "child-1", 1);
  const invalid = await POST(request({
    sessionItemId: diagnosis.currentItem!.id,
    clientSubmissionId: "not-a-uuid",
    answerText: "1".repeat(129),
  }));
  expect(invalid.status).toBe(400);

  const response = await POST(request({
    sessionItemId: diagnosis.currentItem!.id,
    clientSubmissionId: "44444444-4444-4444-8444-444444444444",
    answerText: "wrong",
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    correct: false,
    diagnosis: { completedSlots: 1, currentItem: { position: 2 } },
  });
});

test("POST rejects an item that belongs to another child or is no longer current", async () => {
  const diagnosis = getOrCreateDiagnosis(db, "child-1", 1);
  const first = await POST(request({
    sessionItemId: diagnosis.currentItem!.id,
    clientSubmissionId: "55555555-5555-4555-8555-555555555555",
    answerText: "wrong",
  }));
  expect(first.status).toBe(200);

  const stale = await POST(request({
    sessionItemId: diagnosis.currentItem!.id,
    clientSubmissionId: "66666666-6666-4666-8666-666666666666",
    answerText: "wrong",
  }));
  expect(stale.status).toBe(400);
  expect(await stale.json()).toEqual({ error: "Invalid diagnosis attempt" });
});
