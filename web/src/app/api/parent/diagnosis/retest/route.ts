import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  DiagnosisRetestConflictError,
  DiagnosisStateError,
  startDiagnosisRetest,
} from "@/services/diagnosis/diagnosis-service";

const retestInput = z.strictObject({
  expectedCompletedVersion: z.number().int().positive(),
});

function errorResponse(status: number, code: string, message: string, currentVersion?: number) {
  return NextResponse.json({
    error: {
      code,
      message,
      ...(currentVersion === undefined ? {} : { currentVersion }),
    },
  }, { status });
}
export async function POST(request: Request) {
  const parent = await getCurrentUser();
  if (!parent) return errorResponse(401, "authentication_required", "请先登录家长账号");
  if (parent.role !== "parent") {
    return errorResponse(403, "parent_access_required", "只有家长可以发起重新诊断");
  }

  const input = retestInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return errorResponse(400, "invalid_request", "诊断版本参数无效");

  const db = getDatabase();
  const child = db.select({ id: users.id }).from(users)
    .where(eq(users.role, "child")).limit(1).get();
  if (!child) return errorResponse(404, "child_not_found", "还没有可诊断的孩子账号");

  try {
    const diagnosis = startDiagnosisRetest(db, {
      childId: child.id,
      expectedCompletedVersion: input.data.expectedCompletedVersion,
    });
    return NextResponse.json({ diagnosis }, { status: 201 });
  } catch (error) {
    if (error instanceof DiagnosisRetestConflictError) {
      const message = error.code === "retest_already_active"
        ? `第 ${error.currentVersion} 版诊断已经在进行中`
        : "诊断版本已经变化，请刷新后重试";
      return errorResponse(409, error.code, message, error.currentVersion);
    }
    if (error instanceof DiagnosisStateError) {
      return errorResponse(409, "invalid_diagnosis_state", "当前状态不能发起重新诊断");
    }
    throw error;
  }
}
