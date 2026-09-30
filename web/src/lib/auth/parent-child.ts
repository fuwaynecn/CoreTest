import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { users } from "@/db/schema";
import type { EditionCode } from "@/domain/curriculum/types";
import { getCurrentUser } from "./current-user";

export async function requireParent() {
  const user = await getCurrentUser();
  if (!user || user.role !== "parent") throw new Response(null, { status: 403 });
  return user;
}

export type OwnedChild = {
  id: string;
  displayName: string;
  loginName: string;
  grade: number;
  edition: EditionCode;
};

export function getOwnedChild(db: AppDatabase, parentId: string, childId: string): OwnedChild | null {
  return db.select({
    id: users.id,
    displayName: users.displayName,
    loginName: users.loginName,
    grade: users.grade,
    edition: users.edition,
  })
    .from(users)
    .where(and(eq(users.id, childId), eq(users.parentId, parentId)))
    .get() as OwnedChild | null;
}
