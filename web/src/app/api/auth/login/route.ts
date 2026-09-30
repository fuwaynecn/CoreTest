import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { credentialInputSchema, verifyCredential } from "@/domain/auth/credentials";
import { createSessionToken } from "@/domain/auth/session-token";
import { getDatabase } from "@/db/client";
import { authSessions, users } from "@/db/schema";

const loginNameSchema = z.string().regex(/^[a-z][a-z0-9_.]{1,31}$/);

const loginInput = z.object({
  role: z.enum(["parent", "child"]),
  loginName: loginNameSchema,
  credential: credentialInputSchema,
});

const invalidCredentials = { error: "身份或凭据不正确" };
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export async function POST(request: Request) {
  const input = loginInput.safeParse(await request.json().catch(() => null));

  if (!input.success) {
    return NextResponse.json(invalidCredentials, { status: 401 });
  }

  const db = getDatabase();
  const [user] = await db
    .select({ id: users.id, credentialHash: users.credentialHash })
    .from(users)
    .where(and(eq(users.role, input.data.role), eq(users.loginName, input.data.loginName)))
    .limit(1);

  if (!user || !await verifyCredential(input.data.credential, user.credentialHash)) {
    return NextResponse.json(invalidCredentials, { status: 401 });
  }

  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_MS;
  const token = createSessionToken();

  await db.delete(authSessions).where(lte(authSessions.expiresAt, now));
  await db.insert(authSessions).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash: token.hash,
    expiresAt,
  });

  const response = NextResponse.json({
    redirectTo: input.data.role === "parent" ? "/parent" : "/child",
  });
  response.cookies.set("math_session", token.raw, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production" || process.env.SESSION_COOKIE_SECURE === "true",
    expires: new Date(expiresAt),
  });

  return response;
}
