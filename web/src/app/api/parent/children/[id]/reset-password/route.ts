import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { hashCredential } from "@/domain/auth/credentials";
import { getOwnedChild, requireParent } from "@/lib/auth/parent-child";

const resetPasswordInput = z.object({
  credential: z.string().min(4).max(128),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parent = await requireParent();
    const { id } = await params;
    const db = getDatabase();

    const child = getOwnedChild(db, parent.id, id);
    if (!child) {
      return Response.json(null, { status: 403 });
    }

    const parsed = resetPasswordInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "输入无效" }, { status: 400 });
    }

    const credentialHash = await hashCredential(parsed.data.credential);
    db.update(users).set({ credentialHash }).where(eq(users.id, id)).run();

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "服务器错误" }, { status: 500 });
  }
}
