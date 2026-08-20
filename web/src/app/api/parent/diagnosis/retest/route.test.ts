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

function post(expectedCompletedVersion: unknown) {
  return POST(new Request("http://localhost/api/parent/diagnosis/retest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedCompletedVersion }),
  }));
}

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  state.getCurrentUser.mockReset();
  state.getCurrentUser.mockResolvedValue({ id: "parent", role: "parent", displayName: "家长" });
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "hash", createdAt: 1 },
    { id: "child", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 },
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
