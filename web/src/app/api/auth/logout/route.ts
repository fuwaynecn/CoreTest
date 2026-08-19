import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { hashSessionToken } from "@/domain/auth/session-token";
import { getDatabase } from "@/db/client";
import { authSessions } from "@/db/schema";

export async function POST(request: NextRequest) {
  const rawToken = request.cookies.get("math_session")?.value;

  if (rawToken) {
    await getDatabase()
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, hashSessionToken(rawToken)));
  }

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set("math_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    maxAge: 0,
  });

  return response;
}
