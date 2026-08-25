import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LearningPlanStateError, reviseActivePlan } from "@/services/planning/learning-plan-service";

const inputSchema = z.strictObject({ trainingWeekdays: z.array(z.number().int().min(1).max(7)).length(5).refine((days) => new Set(days).size === 5), targetMinutes: z.number().int().min(20).max(40), specialistFocus: z.enum(["none", "computation", "equation", "reading"]) });
function failure(status: number, code: string, message: string) { return NextResponse.json({ error: { code, message } }, { status }); }
export async function POST(request: Request) {
  const parent = await getCurrentUser(); if (!parent) return failure(401, "authentication_required", "请先登录家长账号"); if (parent.role !== "parent") return failure(403, "parent_access_required", "只有家长可以修改训练计划");
  const input = inputSchema.safeParse(await request.json().catch(() => null)); if (!input.success) return failure(400, "invalid_request", "请选择 5 个不同训练日，并设置 20 到 40 分钟的训练时长");
  const db = getDatabase(); const children = db.select({ id: users.id }).from(users).where(eq(users.role, "child")).all();
  if (children.length === 0) return failure(404, "child_not_found", "还没有孩子账号");
  if (children.length !== 1) return failure(409, "ambiguous_child", "当前账号下的孩子信息不明确，无法修改计划");
  const child = children[0];
  try { return NextResponse.json({ plan: reviseActivePlan(db, child.id, input.data) }); } catch (error) { if (error instanceof LearningPlanStateError) return failure(409, "invalid_plan_state", "当前没有可更新的学习计划"); throw error; }
}
