import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { hashCredential } from "@/domain/auth/credentials";
import { requireParent } from "@/lib/auth/parent-child";

const createChildInput = z.object({
  displayName: z.string().trim().min(1).max(32),
  loginName: z.string().regex(/^[a-z][a-z0-9_.]{1,31}$/),
  grade: z.number().int().min(1).max(6),
  credential: z.string().min(4).max(128),
});

export async function POST(request: Request) {
  try {
    const parent = await requireParent();
    const db = getDatabase();

    const parsed = createChildInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "输入无效" }, { status: 400 });
    }

    const existing = db.select({ id: users.id }).from(users).where(eq(users.loginName, parsed.data.loginName)).get();
    if (existing) {
      return Response.json({ error: "登录名已被使用" }, { status: 409 });
    }

    const id = randomUUID();
    const credentialHash = await hashCredential(parsed.data.credential);

    db.insert(users).values({
      id,
      role: "child",
      displayName: parsed.data.displayName,
      credentialHash,
      createdAt: Date.now(),
      loginName: parsed.data.loginName,
      parentId: parent.id,
      grade: parsed.data.grade,
      edition: "pep",
      isAdmin: false,
    }).run();

    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "服务器错误" }, { status: 500 });
  }
}
