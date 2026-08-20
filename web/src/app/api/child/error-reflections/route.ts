import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { errorObservations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  childReflections,
  ErrorObservationAccessError,
  ErrorObservationConflictError,
  ErrorObservationCorrectionRequiredError,
  saveChildReflection,
} from "@/services/training/error-observation-service";

const inputSchema = z.strictObject({
  sessionItemId: z.string().min(1),
  reflection: z.enum(childReflections),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const child = await getCurrentUser();
  if (!child) return errorResponse(401, "authentication_required", "请先登录孩子账号");
  if (child.role !== "child") return errorResponse(403, "child_access_required", "只有孩子可以保存自评");
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return errorResponse(400, "invalid_request", "错因自评参数无效");

  const db = getDatabase();
  const alreadyRecorded = db.select({ id: errorObservations.id }).from(errorObservations).where(and(
    eq(errorObservations.childId, child.id),
    eq(errorObservations.sessionItemId, input.data.sessionItemId),
    eq(errorObservations.source, "child"),
  )).get() !== undefined;
  try {
    const observation = saveChildReflection(db, { childId: child.id, ...input.data });
    return NextResponse.json({ observation: { id: observation.id } }, { status: alreadyRecorded ? 200 : 201 });
  } catch (error) {
    if (error instanceof ErrorObservationCorrectionRequiredError) {
      return errorResponse(409, "correction_required", "完成订正后再选择错因");
    }
    if (error instanceof ErrorObservationConflictError) {
      return errorResponse(409, "reflection_already_recorded", "这道题已经完成过错因自评");
    }
    if (error instanceof ErrorObservationAccessError) {
      return errorResponse(404, "attempt_not_found", "没有可自评的错误作答");
    }
    throw error;
  }
}
