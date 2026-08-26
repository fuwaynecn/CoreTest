import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { generateAiEnhancement } from "@/services/ai/generate-ai-enhancement";

const inputSchema = z.strictObject({
  provider: z.enum(["openai", "deepseek"]),
});

const testMessages = [
  { role: "system" as const, content: "你正在进行连接测试，只需回复 OK。" },
  { role: "user" as const, content: "请回复 OK。" },
];

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function requireParent() {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(401, "authentication_required", "请先登录家长账号");
  }
  if (user.role !== "parent") {
    return errorResponse(403, "parent_access_required", "只有家长可以测试 AI 服务");
  }

  return null;
}

export async function POST(request: Request) {
  const authError = await requireParent();
  if (authError) {
    return authError;
  }

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return errorResponse(400, "invalid_request", "AI 服务配置无效");
  }

  try {
    const result = await generateAiEnhancement(getDatabase(), {
      provider: input.data.provider,
      messages: testMessages,
      fallbackText: "连接测试未通过",
    });

    if (result.source !== "ai") {
      return errorResponse(502, "ai_unavailable", "AI 服务暂不可用");
    }

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
    });
  } catch {
    return errorResponse(502, "ai_unavailable", "AI 服务暂不可用");
  }
}
