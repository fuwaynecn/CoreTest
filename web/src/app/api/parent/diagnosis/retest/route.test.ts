import { eq } from "drizzle-orm";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { diagnosticRuns, questionTemplates, skills, users } from "@/db/schema";
import { instantiateTemplate } from "@/domain/questions/instantiate-template";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown, getCurrentUser: vi.fn() }));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => state.db };
});
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: state.getCurrentUser }));

import { POST } from "./route";

function post(expectedCompletedVersion: unknown, childId: string = "child") {
  return POST(new Request("http://localhost/api/parent/diagnosis/retest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedCompletedVersion, childId }),
  }));
}

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockReset();
  state.getCurrentUser.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" });
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
    { id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1, parentId: "parent" },
    { id: "parent-other", role: "parent", displayName: "别家家长", credentialHash: "hash", createdAt: 1 },
    { id: "child-other", role: "child", displayName: "别家孩子", credentialHash: "hash", createdAt: 1, parentId: "parent-other" },
  ]).run();
  db.insert(skills).values(phase2Skills).run();
  db.insert(questionTemplates).values(phase2Catalog.map((template) => {
    const instance = instantiateTemplate(template, `seed:${template.id}`);
    return {
      id: template.id,
      skillId: `skill-${template.skillCode}`,
      domain: template.domain,
      contentTier: template.contentTier,
      structureTag: template.structureTag,
      estimatedSeconds: template.estimatedSeconds,
      readingLoad: template.readingLoad,
      answerMode: template.answerMode,
      variantSpec: JSON.stringify(template.variantSpec),
      hintLadder: JSON.stringify(template.hintLadder),
      commonErrors: JSON.stringify(template.commonErrors),
      readingCard: template.readingCard,
      source: template.source,
      licenseStatus: template.licenseStatus,
      stem: instance.stem,
      answerSpec: JSON.stringify(instance.answerSpec),
      explanation: instance.explanation,
      difficulty: template.difficulty,
      active: true,
    };
  })).run();
  db.insert(diagnosticRuns).values({
    id: "run-v1",
    childId: "child",
    version: 1,
    status: "completed",
    currentPart: 3,
    seed: "seed-v1",
    reportSnapshot: JSON.stringify({ skills: [], domains: [] }),
    startedAt: 1,
    completedAt: 2,
  }).run();
});

test.each([
  { user: null, status: 401, code: "authentication_required" },
  { user: { id: "child", role: "child", displayName: "孩子" }, status: 403, code: "parent_access_required" },
])("protects the parent-only retest endpoint", async ({ user, status, code }) => {
  state.getCurrentUser.mockResolvedValue(user);
  const response = await post(1);
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code } });
});

test("returns structured validation, version, and active-retest conflicts", async () => {
  const invalid = await post("1");
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: { code: "invalid_request" } });

  const stale = await post(99);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({
    error: {
      code: "version_conflict",
      message: expect.any(String),
      currentVersion: 1,
    },
  });

  const created = await post(1);
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ diagnosis: { version: 2, status: "in_progress" } });

  const repeated = await post(1);
  expect(repeated.status).toBe(409);
  expect(await repeated.json()).toMatchObject({
    error: { code: "retest_already_active", currentVersion: 2 },
  });
});

test("rejects a child owned by another parent with 403 and creates no run", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  const before = db.select({ id: diagnosticRuns.id }).from(diagnosticRuns).all().length;

  const response = await post(1, "child-other");
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "not_your_child" } });

  const after = db.select({ id: diagnosticRuns.id }).from(diagnosticRuns).all().length;
  expect(after).toBe(before);
  expect(db.select().from(diagnosticRuns).where(eq(diagnosticRuns.childId, "child-other")).all()).toHaveLength(0);
});
