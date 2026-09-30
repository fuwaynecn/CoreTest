import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { getOwnedChild, requireParent } from "@/lib/auth/parent-child";

const updateChildInput = z.object({
  displayName: z.string().trim().min(1).max(32).optional(),
  grade: z.number().int().min(1).max(6).optional(),
});

export async function PATCH(
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

    const parsed = updateChildInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "输入无效" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
    if (parsed.data.grade !== undefined) updateData.grade = parsed.data.grade;

    if (Object.keys(updateData).length > 0) {
      db.update(users).set(updateData).where(eq(users.id, id)).run();
    }

    const updated = getOwnedChild(db, parent.id, id)!;
    return Response.json({
      id: updated.id,
      displayName: updated.displayName,
      loginName: updated.loginName,
      grade: updated.grade,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "服务器错误" }, { status: 500 });
  }
}
