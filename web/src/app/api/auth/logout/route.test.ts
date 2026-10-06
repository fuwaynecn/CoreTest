import { NextRequest } from "next/server";
import { hashSessionToken } from "@/domain/auth/session-token";
import { authSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));

import { POST } from "./route";

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  const now = Date.now();
  db.insert(users).values([
    { id: "parent", role: "parent", displayName: "家长", credentialHash: "h", createdAt: now, loginName: "admin" },
  ]).run();
});

test("deletes the current session, clears the cookie, and redirects to /login (303)", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  const rawToken = "raw-session-token";
  db.insert(authSessions).values({
    id: "session-1",
    tokenHash: hashSessionToken(rawToken),
    userId: "parent",
    expiresAt: Date.now() + 60_000,
  }).run();

  const request = new NextRequest("http://localhost/api/auth/logout", {
    method: "POST",
    headers: { cookie: `math_session=${rawToken}` },
  });
  const response = await POST(request);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost/login");
  const cleared = response.cookies.get("math_session");
  expect(cleared?.value).toBe("");
  const remaining = db.select({ id: authSessions.id }).from(authSessions).all();
  expect(remaining).toHaveLength(0);
});

test("works without a session cookie and still redirects to /login", async () => {
  const request = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
  const response = await POST(request);

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost/login");
});
