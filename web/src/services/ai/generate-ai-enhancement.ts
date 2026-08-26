import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { aiProviderConfigs } from "@/db/schema";
import { type AiProvider, type AiProviderConfigRecord } from "@/domain/ai/provider-config";
import { decryptApiKey } from "@/domain/ai/provider-config-crypto";
import {
  type AiChatMessage,
  AiProviderError,
  type AiProviderErrorCode,
  callAiProvider,
} from "./provider-client";

type GenerateAiEnhancementInput = {
  provider: AiProvider;
  messages: AiChatMessage[];
  fallbackText: string;
  fetchImpl?: typeof fetch;
};

type GenerateAiEnhancementResult = {
  source: "ai" | "preset";
  text: string;
  provider: AiProvider;
  model: string | null;
  errorCode?: "not_configured" | "disabled" | "decrypt_failed" | AiProviderErrorCode;
};

export async function generateAiEnhancement(
  db: AppDatabase,
  input: GenerateAiEnhancementInput,
): Promise<GenerateAiEnhancementResult> {
  const row = db.select().from(aiProviderConfigs)
    .where(eq(aiProviderConfigs.provider, input.provider))
    .limit(1)
    .get();

  if (!row) {
    return presetResult(input, null, "not_configured");
  }

  if (!row.enabled) {
    return presetResult(input, row, "disabled");
  }

  if (!row.encryptedApiKey) {
    return presetResult(input, row, "not_configured");
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(row.encryptedApiKey);
  } catch {
    return presetResult(input, row, "decrypt_failed");
  }

  try {
    const result = await callAiProvider({
      baseUrl: row.baseUrl,
      model: row.model,
      apiKey,
      messages: input.messages,
      fetchImpl: input.fetchImpl,
    });

    return {
      source: "ai",
      text: result.text,
      provider: input.provider,
      model: row.model,
    };
  } catch (error) {
    if (error instanceof AiProviderError) {
      return presetResult(input, row, error.code);
    }

    return presetResult(input, row, "network");
  }
}

function presetResult(
  input: GenerateAiEnhancementInput,
  row: Pick<AiProviderConfigRecord, "model"> | null,
  errorCode: GenerateAiEnhancementResult["errorCode"],
): GenerateAiEnhancementResult {
  return {
    source: "preset",
    text: input.fallbackText,
    provider: input.provider,
    model: row?.model ?? null,
    errorCode,
  };
}
