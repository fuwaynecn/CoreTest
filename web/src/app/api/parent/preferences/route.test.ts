import { users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
const state = vi.hoisted(() => ({ db: undefined as unknown, user: { id: "parent", role: "parent", displayName: "家长" } as unknown }));
vi.mock("@/db/client", async (original) => ({ ...(await original<typeof import("@/db/client")>()), getDatabase: () => state.db }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => state.user }));
import { POST } from "./route";

function seedTwoFamilies(db: ReturnType<typeof createTestDatabase>) {
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "h", createdAt: 1 },
    { id: "child-own", role: "child", displayName: "自家娃", credentialHash: "h", createdAt: 1, parentId: "parent" },
    { id: "parent-other", role: "parent", displayName: "别家", credentialHash: "h", createdAt: 1 },
    { id: "child-other", role: "child", displayName: "别家娃", credentialHash: "h", createdAt: 1, parentId: "parent-other" },
  ]).run();
}

test("rejects a child owned by another parent with 403 and changes no plan", async () => {
  const db = createTestDatabase();
  state.db = db;
  seedTwoFamilies(db);
  const before = db.select().from(users).all().length;

  const response = await POST(new Request("http://localhost/api/parent/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "none", childId: "child-other" }),
  }));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: "not_your_child" } });

  const after = db.select().from(users).all().length;
  expect(after).toBe(before);
});

test("returns 400 when childId is missing from body", async () => {
  const db = createTestDatabase();
  state.db = db;
  seedTwoFamilies(db);
  const response = await POST(new Request("http://localhost/api/parent/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trainingWeekdays: [1, 2, 3, 4, 5], targetMinutes: 30, specialistFocus: "none" }),
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
});
