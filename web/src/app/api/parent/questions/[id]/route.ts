import { NextResponse } from "next/server";
import { z } from "zod";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { getDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  QuestionBankItemNotFoundError,
  QuestionBankValidationError,
  questionBankValidationReasons,
  updateQuestionBankItem,
} from "@/services/parent/question-bank";

const inputSchema = z.strictObject({
  stem: z.string().trim().min(1),
  answerSpec: answerSpecSchema,
  explanation: z.string().trim().min(1),
  skillId: z.string().trim().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  active: z.boolean(),
});

function errorResponse(status: number, code: string, message: string, reasons?: Array<{ code: string; field: string }>) {
  return NextResponse.json({ error: { code, message, ...(reasons ? { reasons } : {}) } }, { status });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parent = await getCurrentUser();
  if (!parent) return errorResponse(401, "authentication_required", "请先登录家长账号");
  if (parent.role !== "parent") return errorResponse(403, "parent_access_required", "只有家长可以修改题库");
  if (!parent.isAdmin) return errorResponse(403, "admin_access_required", "只有管理员可以修改题库");

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    const knownFields = new Set(["stem", "answerSpec", "explanation", "skillId", "difficulty", "active"]);
    const reasons = [...new Map(input.error.issues.map((issue) => {
      const rawField = issue.path[0];
      const field = rawField === "answerSpec" ? "answer" : typeof rawField === "string" && knownFields.has(rawField) ? rawField : "form";
      return [`invalid_request:${field}`, { code: "invalid_request", field }];
    })).values()];
    return errorResponse(400, "invalid_request", "题库题目参数无效", reasons);
  }

  try {
    const { id } = await context.params;
    const question = updateQuestionBankItem(getDatabase(), id, input.data, Date.now());
    return NextResponse.json({ question });
  } catch (error) {
    if (error instanceof QuestionBankItemNotFoundError) {
      return errorResponse(404, "question_not_found", "没有找到这道题目");
    }
    if (error instanceof QuestionBankValidationError) {
      return errorResponse(400, "invalid_question", "题库题目参数无效", questionBankValidationReasons(error.reasons));
    }
    throw error;
  }
}
