import { hashSessionToken } from "@/domain/auth/session-token";
import { authSessions, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { getCurrentUser, requireRole } from "./current-user";

const authState = vi.hoisted(() => ({
  db: undefined as unknown,
  rawToken: undefined as string | undefined,
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return { ...actual, getDatabase: () => authState.db };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => name === "math_session" && authState.rawToken
      ? { name, value: authState.rawToken }
      : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

type TestDatabase = ReturnType<typeof createTestDatabase>;

let db: TestDatabase;

beforeEach(() => {
  db = createTestDatabase();
  authState.db = db;
  authState.rawToken = undefined;
});

test("requireRole redirects an unauthenticated request to login", async () => {
  await expect(requireRole("parent")).rejects.toThrow("redirect:/login");
});

test("requireRole redirects an authenticated user to their own role home", async () => {
  authState.rawToken = "child-session-token";
  await db.insert(users).values({
    id: "child",
    role: "child",
    displayName: "孩子",
    credentialHash: "server-only-hash",
    createdAt: 1,
  });
  await db.insert(authSessions).values({
    id: "child-session",
    userId: "child",
    tokenHash: hashSessionToken(authState.rawToken),
    expiresAt: Date.now() + 60_000,
  });

  await expect(requireRole("parent")).rejects.toThrow("redirect:/child");
});

test("getCurrentUser returns only public identity fields for a live session", async () => {
  authState.rawToken = "parent-session-token";
  await db.insert(users).values({
    id: "parent",
    role: "parent",
    displayName: "家长",
    credentialHash: "server-only-hash",
    createdAt: 1,
  });
  await db.insert(authSessions).values({
    id: "parent-session",
    userId: "parent",
    tokenHash: hashSessionToken(authState.rawToken),
    expiresAt: Date.now() + 60_000,
  });

  expect(await getCurrentUser()).toEqual({
    id: "parent",
    role: "parent",
    displayName: "家长",
    isAdmin: false,
  });
});
