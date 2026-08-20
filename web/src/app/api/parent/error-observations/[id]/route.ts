import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { correctErrorObservation, ErrorObservationAccessError } from "@/services/training/error-observation-service";

const inputSchema = z.strictObject({
  cause: z.enum([
    "missing_unit", "copied_number", "calculation", "relationship",
    "range_check", "incomplete_reading", "unknown",
  ]),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parent = await getCurrentUser();
  if (!parent) return errorResponse(401, "authentication_required", "请先登录家长账号");
  if (parent.role !== "parent") return errorResponse(403, "parent_access_required", "只有家长可以修正错因");
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return errorResponse(400, "invalid_request", "错因修正参数无效");

  const db = getDatabase();
  const child = db.select({ id: users.id }).from(users).where(eq(users.role, "child")).limit(1).get();
  if (!child) return errorResponse(404, "child_not_found", "还没有配置孩子账号");
  const { id } = await context.params;
  try {
    const observation = correctErrorObservation(db, {
      actorId: parent.id, configuredChildId: child.id, observationId: id, cause: input.data.cause,
    });
    return NextResponse.json({ observation: { id: observation.id } });
  } catch (error) {
    if (error instanceof ErrorObservationAccessError) {
      return errorResponse(404, "observation_not_found", "没有找到这个孩子的错因记录");
    }
    throw error;
  }
}
