import { NextRequest } from "next/server";
import { hashCredential } from "@/domain/auth/credentials";
import { hashSessionToken } from "@/domain/auth/session-token";
import { authSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";

const dbState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => dbState.current };
});

type TestDatabase = ReturnType<typeof createTestDatabase>;

let db: TestDatabase;
let parentCredentialHash: string;
let childCredentialHash: string;

beforeAll(async () => {
  [parentCredentialHash, childCredentialHash] = await Promise.all([
    hashCredential("parent-password"),
    hashCredential("2468"),
  ]);
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  db = createTestDatabase();
  dbState.current = db;
  await db.insert(users).values([
    {
      id: "parent",
      role: "parent",
      displayName: "家长",
      credentialHash: parentCredentialHash,
      createdAt: 1,
    },
    {
      id: "child",
      role: "child",
      displayName: "孩子",
      credentialHash: childCredentialHash,
      createdAt: 1,
    },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function loginRequest(role: "parent" | "child", credential: string) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, credential }),
  });
}

test("logs the selected role in with a hash-only seven-day session and secure production cookie", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const expiredTokenHash = hashSessionToken("expired-token");
  await db.insert(authSessions).values({
    id: "expired-session",
    userId: "parent",
    tokenHash: expiredTokenHash,
    expiresAt: Date.now() - 1,
  });
  const before = Date.now();

  const response = await login(loginRequest("parent", "parent-password"));
  const after = Date.now();

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ redirectTo: "/parent" });
  const rawToken = response.cookies.get("math_session")?.value;
  expect(rawToken).toBeTruthy();
  const [session] = await db.select().from(authSessions);
  expect(session.tokenHash).toBe(hashSessionToken(rawToken!));
  expect(session.tokenHash).not.toBe(rawToken);
  expect(session.tokenHash).not.toBe(expiredTokenHash);
  expect(session.expiresAt).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1_000);
  expect(session.expiresAt).toBeLessThanOrEqual(after + 7 * 24 * 60 * 60 * 1_000);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=lax");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("Expires=");
});

test("selects the child role independently", async () => {
  const response = await login(loginRequest("child", "2468"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ redirectTo: "/child" });
  const [session] = await db.select().from(authSessions);
  expect(session.userId).toBe("child");
});

test("returns the same generic failure for either role and malformed input", async () => {
  const attempts = [
    loginRequest("parent", "wrong-password"),
    loginRequest("child", "9999"),
    loginRequest("child", "1"),
  ];

  for (const request of attempts) {
    const response = await login(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "身份或凭据不正确" });
    expect(response.headers.get("set-cookie")).toBeNull();
  }
  expect(await db.select().from(authSessions)).toEqual([]);
});

test("logout deletes the hashed session and expires a secure production cookie", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const rawToken = "server-only-session-token";
  await db.insert(authSessions).values({
    id: "active-session",
    userId: "child",
    tokenHash: hashSessionToken(rawToken),
    expiresAt: Date.now() + 60_000,
  });
  const request = new NextRequest("http://localhost/api/auth/logout", {
    method: "POST",
    headers: { cookie: `math_session=${rawToken}` },
  });

  const response = await logout(request);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost/login");
  expect(await db.select().from(authSessions)).toEqual([]);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toContain("math_session=");
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("SameSite=lax");
  expect(cookie).toContain("Path=/");
  expect(cookie).toContain("Max-Age=0");
  expect(cookie).not.toContain(rawToken);
});
