import { and, eq } from "drizzle-orm";
import { childSkillSettings, skills, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  parent: { id: "parent", role: "parent", displayName: "家长", isAdmin: false } as
    | { id: string; role: string; displayName: string; isAdmin: boolean }
    | null,
}));

vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));

vi.mock("@/lib/auth/parent-child", () => ({
  requireParent: () => {
    if (!state.parent || state.parent.role !== "parent") {
      throw new Response(null, { status: 403 });
    }
    return state.parent;
  },
  getOwnedChild: (_db: unknown, parentId: string, childId: string) => {
    if (parentId === "parent" && childId === "c1") {
      return { id: "c1", displayName: "大宝", loginName: "kid1", grade: 6, edition: "pep" };
    }
    return null;
  },
}));

import { GET, PUT } from "./route";

function seedFixtures(db: ReturnType<typeof createTestDatabase>) {
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "h", createdAt: 1, loginName: "testparent" },
    { id: "c1", role: "child", displayName: "大宝", credentialHash: "h", createdAt: 1, loginName: "kid1", parentId: "parent", grade: 6 },
  ]).run();
  db.insert(skills).values([
    { id: "skill-low", code: "low", name: "低年级技能", domain: "number_operations", grade: 4, semester: 2, expectedWeek: 20 },
    { id: "skill-same-open", code: "same-open", name: "同级已开", domain: "number_operations", grade: 6, semester: 1, expectedWeek: 3 },
    { id: "skill-same-locked", code: "same-locked", name: "同级未开", domain: "number_operations", grade: 6, semester: 1, expectedWeek: 9 },
  ]).run();
}

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  state.parent = { id: "parent", role: "parent", displayName: "家长", isAdmin: false };
  seedFixtures(db);
});

test("1. GET c1 returns 200 with skill rows", async () => {
  const response = await GET(new Request("http://localhost/api/parent/children/c1/skills"), {
    params: Promise.resolve({ id: "c1" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  const first = body[0];
  expect(first).toHaveProperty("skillId");
  expect(first).toHaveProperty("code");
  expect(first).toHaveProperty("name");
  expect(first).toHaveProperty("grade");
  expect(first).toHaveProperty("semester");
  expect(first).toHaveProperty("expectedWeek");
  expect(first).toHaveProperty("mode");
  expect(first).toHaveProperty("autoAvailable");
  expect(first).toHaveProperty("enabled");
});

test("2. PUT mode 'on' upserts setting row", async () => {
  const response = await PUT(new Request("http://localhost/api/parent/children/c1/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-same-locked", mode: "on" }),
  }), { params: Promise.resolve({ id: "c1" }) });
  expect(response.status).toBe(200);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const row = db.select({ mode: childSkillSettings.mode })
    .from(childSkillSettings)
    .where(and(eq(childSkillSettings.childId, "c1"), eq(childSkillSettings.skillId, "skill-same-locked")))
    .get();
  expect(row?.mode).toBe("on");
});

test("3. PUT twice with different modes → upsert (one row, last value wins)", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;

  await PUT(new Request("http://localhost/api/parent/children/c1/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-low", mode: "on" }),
  }), { params: Promise.resolve({ id: "c1" }) });

  await PUT(new Request("http://localhost/api/parent/children/c1/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-low", mode: "off" }),
  }), { params: Promise.resolve({ id: "c1" }) });

  const rows = db.select().from(childSkillSettings)
    .where(eq(childSkillSettings.childId, "c1"))
    .all();
  expect(rows.length).toBe(1);
  expect(rows[0].mode).toBe("off");
});

test("4. PUT mode 'auto' persists auto row (not deletion)", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;

  const response = await PUT(new Request("http://localhost/api/parent/children/c1/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-low", mode: "auto" }),
  }), { params: Promise.resolve({ id: "c1" }) });
  expect(response.status).toBe(200);

  const row = db.select().from(childSkillSettings)
    .where(eq(childSkillSettings.childId, "c1"))
    .get();
  expect(row).toBeDefined();
  expect(row?.mode).toBe("auto");
});

test("5. PUT illegal mode returns 400 and no row inserted", async () => {
  const response = await PUT(new Request("http://localhost/api/parent/children/c1/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-low", mode: "maybe" }),
  }), { params: Promise.resolve({ id: "c1" }) });
  expect(response.status).toBe(400);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const count = db.select().from(childSkillSettings).where(eq(childSkillSettings.childId, "c1")).all().length;
  expect(count).toBe(0);
});

test("6. PUT unknown skillId returns 400 and no orphan row", async () => {
  const response = await PUT(new Request("http://localhost/api/parent/children/c1/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-nope", mode: "on" }),
  }), { params: Promise.resolve({ id: "c1" }) });
  expect(response.status).toBe(400);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const count = db.select().from(childSkillSettings).where(eq(childSkillSettings.childId, "c1")).all().length;
  expect(count).toBe(0);
});

test("7. GET/PUT for other family's child returns 403", async () => {
  const getRes = await GET(new Request("http://localhost/api/parent/children/c-other/skills"), {
    params: Promise.resolve({ id: "c-other" }),
  });
  expect(getRes.status).toBe(403);

  const putRes = await PUT(new Request("http://localhost/api/parent/children/c-other/skills", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ skillId: "skill-low", mode: "on" }),
  }), { params: Promise.resolve({ id: "c-other" }) });
  expect(putRes.status).toBe(403);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const count = db.select().from(childSkillSettings).all().length;
  expect(count).toBe(0);
});

test("8. Unauthenticated returns 403", async () => {
  const originalParent = state.parent;
  try {
    state.parent = null;
    const response = await GET(new Request("http://localhost/api/parent/children/c1/skills"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(response.status).toBe(403);
  } finally {
    state.parent = originalParent;
  }
});
