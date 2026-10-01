import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOwnedChild } from "@/lib/auth/parent-child";
import { resumeCurrentTrainingSession } from "@/services/parent/resume-training-session";

const bodySchema = z.strictObject({
  childId: z.string().min(1),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parent = await getCurrentUser();
  if (!parent) return errorResponse(401, "authentication_required", "请先登录家长账号");
  if (parent.role !== "parent") return errorResponse(403, "parent_access_required", "只有家长可以恢复训练");

  const input = bodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return errorResponse(400, "invalid_request", "恢复训练参数无效");

  const { id } = await params;
  const db = getDatabase();
  const child = getOwnedChild(db, parent.id, input.data.childId);
  if (!child) return errorResponse(403, "not_your_child", "不能操作别家孩子");

  if (!resumeCurrentTrainingSession(db, child.id, id, shanghaiDateKey())) {
    return errorResponse(409, "session_not_resumable", "今天没有可以恢复的未完成训练");
  }
  return NextResponse.json({ status: "in_progress" });
}
