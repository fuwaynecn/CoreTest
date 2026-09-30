import { eq } from "drizzle-orm";
import { hashCredential } from "@/domain/auth/credentials";
import { users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  user: { id: "parent", role: "parent", displayName: "家长" } as unknown,
}));
vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => state.user,
}));

import { POST as createChild } from "./route";
import { PATCH } from "./[id]/route";
import { POST as resetPassword } from "./[id]/reset-password/route";

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  state.user = { id: "parent", role: "parent", displayName: "家长" };
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "h", createdAt: 1, loginName: "testparent" },
    { id: "c-own", role: "child", displayName: "大宝", credentialHash: "h", createdAt: 1, loginName: "kid1", parentId: "parent", grade: 6 },
    { id: "parent-other", role: "parent", displayName: "别家", credentialHash: "h", createdAt: 1, loginName: "otherparent" },
    { id: "c-other", role: "child", displayName: "别家娃", credentialHash: "h", createdAt: 1, loginName: "kidother", parentId: "parent-other", grade: 2 },
  ]).run();
});

test("1. POST creates a child owned by current parent", async () => {
  const response = await createChild(new Request("http://localhost/api/parent/children", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "小二", loginName: "kid2", grade: 3, credential: "1357" }),
  }));
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.id).toBeDefined();

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const row = db.select({ parentId: users.parentId, grade: users.grade, role: users.role, edition: users.edition })
    .from(users)
    .where(eq(users.loginName, "kid2"))
    .get();
  expect(row?.parentId).toBe("parent");
  expect(row?.grade).toBe(3);
  expect(row?.role).toBe("child");
  expect(row?.edition).toBe("pep");
});

test("2. POST duplicate loginName returns 409", async () => {
  // Create kid2 first within this test
  await createChild(new Request("http://localhost/api/parent/children", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "小二", loginName: "kid2", grade: 3, credential: "1357" }),
  }));
  const response = await createChild(new Request("http://localhost/api/parent/children", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "又一个", loginName: "kid2", grade: 4, credential: "9999" }),
  }));
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.error).toBe("登录名已被使用");
});

test("3. POST invalid input returns 400 and no new row", async () => {
  const response = await createChild(new Request("http://localhost/api/parent/children", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "", loginName: "kid_bad", grade: 3, credential: "1357" }),
  }));
  expect(response.status).toBe(400);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const count = db.select({ id: users.id }).from(users).where(eq(users.loginName, "kid_bad")).all().length;
  expect(count).toBe(0);
});

test("4. PATCH owned child updates grade and displayName", async () => {
  const response = await PATCH(new Request("http://localhost/api/parent/children/c-own", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grade: 5, displayName: "大宝改名" }),
  }), { params: Promise.resolve({ id: "c-own" }) });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.id).toBe("c-own");
  expect(body.displayName).toBe("大宝改名");
  expect(body.grade).toBe(5);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const row = db.select({ displayName: users.displayName, grade: users.grade })
    .from(users)
    .where(eq(users.id, "c-own"))
    .get();
  expect(row?.displayName).toBe("大宝改名");
  expect(row?.grade).toBe(5);
});

test("5. PATCH other family's child returns 403", async () => {
  const response = await PATCH(new Request("http://localhost/api/parent/children/c-other", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grade: 2 }),
  }), { params: Promise.resolve({ id: "c-other" }) });
  expect(response.status).toBe(403);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const row = db.select({ grade: users.grade })
    .from(users)
    .where(eq(users.id, "c-other"))
    .get();
  expect(row?.grade).toBe(2);
});

test("6. PATCH nonexistent id returns 403", async () => {
  const response = await PATCH(new Request("http://localhost/api/parent/children/c-nope", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grade: 2 }),
  }), { params: Promise.resolve({ id: "c-nope" }) });
  expect(response.status).toBe(403);
});

test("7. reset-password owned child updates credentialHash", async () => {
  const response = await resetPassword(new Request("http://localhost/api/parent/children/c-own/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential: "2468" }),
  }), { params: Promise.resolve({ id: "c-own" }) });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const row = db.select({ credentialHash: users.credentialHash })
    .from(users)
    .where(eq(users.id, "c-own"))
    .get();
  expect(row?.credentialHash).not.toBe("h");
  const expected = await hashCredential("2468");
  // Both use the same format scrypt:salt:key; verify via format not exact value (salt random)
  expect(row?.credentialHash?.startsWith("scrypt:")).toBe(true);
  expect(row?.credentialHash?.split(":").length).toBe(3);
  expect(expected.startsWith("scrypt:")).toBe(true);
});

test("8. reset-password other family's child returns 403", async () => {
  const response = await resetPassword(new Request("http://localhost/api/parent/children/c-other/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential: "2468" }),
  }), { params: Promise.resolve({ id: "c-other" }) });
  expect(response.status).toBe(403);
});

test("9. Unauthenticated returns 403", async () => {
  const originalUser = state.user;
  try {
    state.user = null;
    const response = await createChild(new Request("http://localhost/api/parent/children", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "test", loginName: "kidx", grade: 1, credential: "1111" }),
    }));
    expect(response.status).toBe(403);
  } finally {
    state.user = originalUser;
  }
});
