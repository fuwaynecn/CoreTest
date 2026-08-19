import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashSessionToken } from "@/domain/auth/session-token";
import { getDatabase } from "@/db/client";
import { authSessions, users } from "@/db/schema";

export type CurrentUser = {
  id: string;
  role: "parent" | "child";
  displayName: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const rawToken = (await cookies()).get("math_session")?.value;

  if (!rawToken) return null;

  const [user] = await getDatabase()
    .select({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(and(
      eq(authSessions.tokenHash, hashSessionToken(rawToken)),
      gt(authSessions.expiresAt, Date.now()),
    ))
    .limit(1);

  return user ?? null;
}

export async function requireRole(role: CurrentUser["role"]): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "parent" ? "/parent" : "/child");

  return user;
}
