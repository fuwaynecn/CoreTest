import { aiProviderConfigs } from "@/db/schema";
import { encryptApiKey } from "@/domain/ai/provider-config-crypto";
import { createTestDatabase } from "@/test/test-db";
import { generateAiEnhancement } from "./generate-ai-enhancement";

const MASTER_SECRET = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", MASTER_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("returns preset text when provider is missing", async () => {
  const db = createTestDatabase();

  await expect(generateAiEnhancement(db, {
    provider: "openai",
    messages: [],
    fallbackText: "预设",
  })).resolves.toMatchObject({
    source: "preset",
    text: "预设",
    provider: "openai",
    model: null,
    errorCode: "not_configured",
  });
});

test("returns preset text when provider is disabled", async () => {
  const db = createTestDatabase();

  db.insert(aiProviderConfigs).values({
    provider: "openai",
    baseUrl: "https://example.com/v1",
    model: "m",
    encryptedApiKey: null,
    enabled: false,
    createdAt: 1,
    updatedAt: 1,
  }).run();

  await expect(generateAiEnhancement(db, {
    provider: "openai",
    messages: [],
    fallbackText: "预设",
  })).resolves.toMatchObject({
    source: "preset",
    text: "预设",
    provider: "openai",
    model: "m",
    errorCode: "disabled",
  });
});

test("returns preset text when encrypted key is missing", async () => {
  const db = createTestDatabase();

  db.insert(aiProviderConfigs).values({
    provider: "openai",
    baseUrl: "https://example.com/v1",
    model: "m",
    encryptedApiKey: null,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }).run();

  await expect(generateAiEnhancement(db, {
    provider: "openai",
    messages: [],
    fallbackText: "预设",
  })).resolves.toMatchObject({
    source: "preset",
    text: "预设",
    provider: "openai",
    model: "m",
    errorCode: "not_configured",
  });
});

test("returns preset text when decryption fails", async () => {
  const db = createTestDatabase();

  db.insert(aiProviderConfigs).values({
    provider: "deepseek",
    baseUrl: "https://example.com/v1",
    model: "m",
    encryptedApiKey: "v1.invalid.invalid.invalid",
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }).run();

  await expect(generateAiEnhancement(db, {
    provider: "deepseek",
    messages: [],
    fallbackText: "预设",
  })).resolves.toMatchObject({
    source: "preset",
    text: "预设",
    provider: "deepseek",
    model: "m",
    errorCode: "decrypt_failed",
  });
});

test("returns preset text when provider call fails", async () => {
  const db = createTestDatabase();

  db.insert(aiProviderConfigs).values({
    provider: "openai",
    baseUrl: "https://example.com/v1",
    model: "m",
    encryptedApiKey: encryptApiKey("runtime-secret", MASTER_SECRET),
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }).run();

  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 500 }));

  await expect(generateAiEnhancement(db, {
    provider: "openai",
    messages: [{ role: "user", content: "解释" }],
    fallbackText: "预设",
    fetchImpl,
  })).resolves.toMatchObject({
    source: "preset",
    text: "预设",
    provider: "openai",
    model: "m",
    errorCode: "http",
  });
});

test("returns AI text only for a configured enabled provider", async () => {
  const db = createTestDatabase();

  db.insert(aiProviderConfigs).values({
    provider: "openai",
    baseUrl: "https://example.com/v1",
    model: "m",
    encryptedApiKey: encryptApiKey("runtime-secret", MASTER_SECRET),
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  }).run();

  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: "AI 讲解" } }],
  }), { status: 200 }));

  await expect(generateAiEnhancement(db, {
    provider: "openai",
    messages: [{ role: "user", content: "解释" }],
    fallbackText: "预设",
    fetchImpl,
  })).resolves.toMatchObject({
    source: "ai",
    text: "AI 讲解",
    provider: "openai",
    model: "m",
  });
});
