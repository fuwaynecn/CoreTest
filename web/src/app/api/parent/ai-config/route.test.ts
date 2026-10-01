import { aiProviderConfigs } from "@/db/schema";
import { decryptApiKey, encryptApiKey } from "@/domain/ai/provider-config-crypto";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({
  db: undefined as ReturnType<typeof createTestDatabase> | undefined,
  user: { id: "parent", role: "parent", displayName: "家长", isAdmin: true } as {
    id: string;
    role: "parent" | "child";
    displayName: string;
    isAdmin: boolean;
  } | null,
}));

vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => state.user,
}));

import { GET, POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/parent/ai-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.db = createTestDatabase();
  state.user = { id: "parent", role: "parent", displayName: "家长", isAdmin: true };
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("GET lists both providers without exposing a key", async () => {
  const encryptedApiKey = encryptApiKey("secret-key");
  const encryptedTail = encryptedApiKey.slice(-4);

  state.db!.insert(aiProviderConfigs).values({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    encryptedApiKey,
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
  }).run();

  const response = await GET(new Request("http://localhost/api/parent/ai-config"));

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.providers).toHaveLength(2);
  expect(body.providers[0]).toMatchObject({
    provider: "openai",
    hasApiKey: true,
    apiKeyMasked: "••••••已配置",
  });
  expect(body.providers[0]).not.toHaveProperty("encryptedApiKey");
  expect(JSON.stringify(body).includes(encryptedApiKey)).toBe(false);
  expect(JSON.stringify(body).includes(encryptedTail)).toBe(false);
});

test("parent can create, update, retain, disable, and clear a key", async () => {
  const replacementKey = "route-replacement-key";
  const create = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    enabled: true,
    apiKey: replacementKey,
  }));

  expect(create.status).toBe(200);
  const createdEncryptedApiKey = state.db!.select({ encryptedApiKey: aiProviderConfigs.encryptedApiKey })
    .from(aiProviderConfigs)
    .get()!.encryptedApiKey!;
  expect(createdEncryptedApiKey === replacementKey).toBe(false);
  expect(decryptApiKey(createdEncryptedApiKey) === replacementKey).toBe(true);

  const retain = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    enabled: false,
  }));

  const storedEncryptedApiKey = state.db!.select({ encryptedApiKey: aiProviderConfigs.encryptedApiKey })
    .from(aiProviderConfigs)
    .get()!.encryptedApiKey!;
  const storedEncryptedTail = storedEncryptedApiKey.slice(-4);
  const retainBody = await retain.json();

  expect(retainBody).toMatchObject({
    provider: {
      model: "gpt-5-mini",
      enabled: false,
      hasApiKey: true,
      apiKeyMasked: "••••••已配置",
    },
  });
  expect(JSON.stringify(retainBody).includes(storedEncryptedApiKey)).toBe(false);
  expect(JSON.stringify(retainBody).includes(storedEncryptedTail)).toBe(false);

  const clear = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    enabled: false,
    clearApiKey: true,
  }));

  expect(await clear.json()).toMatchObject({
    provider: { hasApiKey: false, apiKeyMasked: "" },
  });
});

test("child and anonymous sessions are rejected", async () => {
  state.user = { id: "child", role: "child", displayName: "孩子", isAdmin: false };
  const childResponse = await GET(new Request("http://localhost/api/parent/ai-config"));
  expect(childResponse.status).toBe(403);
  expect(await childResponse.json()).toEqual({
    error: { code: "parent_access_required", message: "只有家长可以配置 AI 服务" },
  });

  state.user = null;
  const anonymousResponse = await GET(new Request("http://localhost/api/parent/ai-config"));
  expect(anonymousResponse.status).toBe(401);
  expect(await anonymousResponse.json()).toEqual({
    error: { code: "authentication_required", message: "请先登录家长账号" },
  });
});

test("non-admin parent cannot read or write AI provider config", async () => {
  state.user = { id: "parent-2", role: "parent", displayName: "普通家长", isAdmin: false };

  const getResponse = await GET(new Request("http://localhost/api/parent/ai-config"));
  expect(getResponse.status).toBe(403);
  expect(await getResponse.json()).toEqual({
    error: { code: "admin_access_required", message: "只有管理员可以配置 AI 服务" },
  });

  const postResponse = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    enabled: true,
    apiKey: "should-not-be-stored",
  }));
  expect(postResponse.status).toBe(403);
  expect(state.db!.select({ provider: aiProviderConfigs.provider }).from(aiProviderConfigs).all())
    .toHaveLength(0);
});

test.each([
  ["unsupported provider", {
    provider: "other", baseUrl: "https://example.com", model: "model", enabled: true,
  }],
  ["non-web URL", {
    provider: "openai", baseUrl: "file:///tmp/key", model: "model", enabled: true,
  }],
  ["blank model", {
    provider: "openai", baseUrl: "https://example.com", model: "", enabled: true,
  }],
  ["unknown field", {
    provider: "openai", baseUrl: "https://example.com", model: "model", enabled: true,
    extra: true,
  }],
  ["conflicting key operations", {
    provider: "openai", baseUrl: "https://example.com", model: "model", enabled: true,
    apiKey: "replacement", clearApiKey: true,
  }],
  ["overlong replacement key", {
    provider: "openai", baseUrl: "https://example.com", model: "model", enabled: true,
    apiKey: "x".repeat(513),
  }],
] as const)("%s returns 400", async (_caseName, body) => {
  const response = await POST(jsonRequest(body));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: { code: "invalid_request", message: "AI 服务配置无效" },
  });
});

test("missing master secret returns the safe 503", async () => {
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "");

  const response = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://example.com",
    model: "x",
    enabled: true,
    apiKey: "secret",
  }));

  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});
