import { z } from "zod";

export const AI_PROVIDERS = ["openai", "deepseek"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiProviderConfigRecord = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  encryptedApiKey: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

const validatedAiProviderConfigSchema = z.strictObject({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.url({ protocol: /^https?$/ }),
  model: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});

export type ValidatedAiProviderConfig = z.infer<typeof validatedAiProviderConfigSchema>;

export function maskApiKey(apiKey: string): string {
  if (!apiKey) {
    return "";
  }
  if (apiKey.length <= 4) {
    return "••••••";
  }

  return `••••••${apiKey.slice(-4)}`;
}

export function validateAiProviderConfig(input: unknown): ValidatedAiProviderConfig {
  return validatedAiProviderConfigSchema.parse(input);
}
