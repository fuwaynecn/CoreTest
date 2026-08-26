import { NextResponse } from "next/server";
import { z } from "zod";
import {
  type AiProvider,
  validateAiProviderConfig,
} from "@/domain/ai/provider-config";
import { getDatabase } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listAiProviderConfigs,
  saveAiProviderConfig,
} from "@/services/parent/ai-provider-config";

const postInputSchema = z.strictObject({
  provider: z.enum(["openai", "deepseek"]),
  baseUrl: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  apiKey: z.string().min(1).optional(),
  clearApiKey: z.boolean().optional(),
}).refine((value) => !(value.apiKey && value.clearApiKey), {
  message: "conflicting apiKey and clearApiKey",
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function requireParent() {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(401, "authentication_required", "请先登录家长账号");
  }
  if (user.role !== "parent") {
    return errorResponse(403, "parent_access_required", "只有家长可以配置 AI 服务");
  }

  return null;
}

export async function GET(request: Request) {
  void request;

  const authError = await requireParent();
  if (authError) {
    return authError;
  }

  return NextResponse.json({ providers: listAiProviderConfigs(getDatabase()) });
}

export async function POST(request: Request) {
  const authError = await requireParent();
  if (authError) {
    return authError;
  }

  const input = postInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return errorResponse(400, "invalid_request", "AI 服务配置无效");
  }

  try {
    const validated = validateAiProviderConfig({
      provider: input.data.provider,
      baseUrl: input.data.baseUrl,
      model: input.data.model,
      enabled: input.data.enabled,
    });

    return NextResponse.json({
      provider: saveAiProviderConfig(getDatabase(), {
        provider: validated.provider as AiProvider,
        baseUrl: validated.baseUrl,
        model: validated.model,
        enabled: validated.enabled,
        apiKey: input.data.apiKey,
        clearApiKey: input.data.clearApiKey,
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(400, "invalid_request", "AI 服务配置无效");
    }
    if (error instanceof Error && error.message === "AI_CONFIG_ENCRYPTION_KEY must be at least 32 characters") {
      return errorResponse(503, "ai_config_unavailable", "AI 配置暂不可用，请先设置服务端加密密钥");
    }
    throw error;
  }
}
