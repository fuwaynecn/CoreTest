import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { getCurrentUser } from "@/lib/auth/current-user";
import { users } from "@/db/schema";
import { resumeCurrentTrainingSession } from "@/services/parent/resume-training-session";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parent = await getCurrentUser();
  if (!parent) return errorResponse(401, "authentication_required", "请先登录家长账号");
  if (parent.role !== "parent") return errorResponse(403, "parent_access_required", "只有家长可以恢复训练");

  const { id } = await params;
  const db = getDatabase();
  const children = db.select({ id: users.id }).from(users).where(eq(users.role, "child")).all();
  if (children.length === 0) return errorResponse(404, "child_not_found", "还没有孩子账号");
  if (children.length !== 1) return errorResponse(409, "ambiguous_child", "当前孩子信息不明确，无法恢复训练");

  if (!resumeCurrentTrainingSession(db, children[0].id, id, shanghaiDateKey())) {
    return errorResponse(409, "session_not_resumable", "今天没有可以恢复的未完成训练");
  }
  return NextResponse.json({ status: "in_progress" });
}
