import { aiProviderConfigs } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

const state = vi.hoisted(() => ({
  db: undefined as ReturnType<typeof createTestDatabase> | undefined,
  user: { id: "parent", role: "parent", displayName: "家长" } as {
    id: string;
    role: "parent" | "child";
    displayName: string;
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
  state.user = { id: "parent", role: "parent", displayName: "家长" };
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("GET lists both providers without exposing a key", async () => {
  state.db!.insert(aiProviderConfigs).values({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    encryptedApiKey: "opaque-secret-key",
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
    apiKeyMasked: "••••••-key",
  });
  expect(body.providers[0]).not.toHaveProperty("encryptedApiKey");
});

test("parent can create, update, retain, disable, and clear a key", async () => {
  const create = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    enabled: true,
    apiKey: "secret-key",
  }));

  expect(create.status).toBe(200);

  const retain = await POST(jsonRequest({
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    enabled: false,
  }));

  expect(await retain.json()).toMatchObject({
    provider: { model: "gpt-5-mini", enabled: false, hasApiKey: true },
  });

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
  state.user = { id: "child", role: "child", displayName: "孩子" };
  expect((await GET(new Request("http://localhost/api/parent/ai-config"))).status).toBe(403);

  state.user = null;
  expect((await GET(new Request("http://localhost/api/parent/ai-config"))).status).toBe(401);
});

test("invalid payloads return 400 and never echo a submitted key", async () => {
  const response = await POST(jsonRequest({
    provider: "other",
    baseUrl: "file:///tmp/key",
    model: "",
    enabled: true,
    apiKey: "secret",
    clearApiKey: true,
    extra: true,
  }));

  expect(response.status).toBe(400);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
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
