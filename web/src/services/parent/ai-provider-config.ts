import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { aiProviderConfigs } from "@/db/schema";
import {
  AI_PROVIDERS,
  type AiProvider,
  maskApiKey,
} from "@/domain/ai/provider-config";
import { encryptApiKey } from "@/domain/ai/provider-config-crypto";

export type AiProviderConfigView = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  updatedAt: number | null;
};

type SaveAiProviderConfigInput = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  enabled: boolean;
  apiKey?: string;
  clearApiKey?: boolean;
};

function toView(
  provider: AiProvider,
  row?: {
    baseUrl: string;
    model: string;
    encryptedApiKey: string | null;
    enabled: boolean;
    updatedAt: number;
  },
  apiKeyForMask?: string | null,
): AiProviderConfigView {
  const maskedSource = apiKeyForMask ?? row?.encryptedApiKey ?? "";

  return {
    provider,
    baseUrl: row?.baseUrl ?? "",
    model: row?.model ?? "",
    enabled: row?.enabled ?? false,
    hasApiKey: Boolean(row?.encryptedApiKey),
    apiKeyMasked: maskApiKey(maskedSource),
    updatedAt: row?.updatedAt ?? null,
  };
}

export function listAiProviderConfigs(db: AppDatabase): AiProviderConfigView[] {
  const rows = db.select().from(aiProviderConfigs).all();
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return AI_PROVIDERS.map((provider) => toView(provider, byProvider.get(provider)));
}

export function saveAiProviderConfig(
  db: AppDatabase,
  input: SaveAiProviderConfigInput,
): AiProviderConfigView {
  const existing = db.select().from(aiProviderConfigs)
    .where(eq(aiProviderConfigs.provider, input.provider))
    .limit(1)
    .get();
  const now = Date.now();
  const encryptedApiKey = input.clearApiKey
    ? null
    : input.apiKey === undefined
      ? existing?.encryptedApiKey ?? null
      : encryptApiKey(input.apiKey);

  db.insert(aiProviderConfigs).values({
    provider: input.provider,
    baseUrl: input.baseUrl,
    model: input.model,
    encryptedApiKey,
    enabled: input.enabled,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: aiProviderConfigs.provider,
    set: {
      baseUrl: input.baseUrl,
      model: input.model,
      encryptedApiKey,
      enabled: input.enabled,
      updatedAt: now,
    },
  }).run();

  return toView(input.provider, {
    baseUrl: input.baseUrl,
    model: input.model,
    encryptedApiKey,
    enabled: input.enabled,
    updatedAt: now,
  }, input.clearApiKey ? "" : input.apiKey);
}
