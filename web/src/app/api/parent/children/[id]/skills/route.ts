import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { childSkillSettings, skills } from "@/db/schema";
import { getOwnedChild, requireParent } from "@/lib/auth/parent-child";
import { listChildSkillScope } from "@/services/curriculum/skill-scope";

const updateSkillModeInput = z.object({
  skillId: z.string().min(1),
  mode: z.enum(["auto", "on", "off"]),
});

export async function GET(
  _request: Request,
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

    const rows = listChildSkillScope(db, { id: child.id, grade: child.grade, edition: child.edition });
    return Response.json(rows);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(
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

    const parsed = updateSkillModeInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "输入无效" }, { status: 400 });
    }

    // Verify skill exists
    const skill = db.select({ id: skills.id })
      .from(skills)
      .where(eq(skills.id, parsed.data.skillId))
      .get();
    if (!skill) {
      return Response.json({ error: "技能不存在" }, { status: 400 });
    }

    db.insert(childSkillSettings)
      .values({
        childId: child.id,
        skillId: parsed.data.skillId,
        mode: parsed.data.mode,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [childSkillSettings.childId, childSkillSettings.skillId],
        set: { mode: parsed.data.mode, updatedAt: Date.now() },
      })
      .run();

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "服务器错误" }, { status: 500 });
  }
}