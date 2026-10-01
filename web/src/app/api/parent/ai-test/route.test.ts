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

const generateAiEnhancement = vi.fn();

vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => state.user,
}));

vi.mock("@/services/ai/generate-ai-enhancement", () => ({
  generateAiEnhancement: (...args: unknown[]) => generateAiEnhancement(...args),
}));

import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/parent/ai-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.db = createTestDatabase();
  state.user = { id: "parent", role: "parent", displayName: "家长", isAdmin: true };
  generateAiEnhancement.mockReset();
});

test("parent test route calls selected provider and returns safe success", async () => {
  generateAiEnhancement.mockResolvedValue({
    source: "ai",
    text: "不应返回",
    provider: "openai",
    model: "gpt-5",
  });

  const response = await POST(jsonRequest({ provider: "openai" }));

  expect(generateAiEnhancement).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      provider: "openai",
      fallbackText: "连接测试未通过",
      messages: [
        { role: "system", content: "你正在进行连接测试，只需回复 OK。" },
        { role: "user", content: "请回复 OK。" },
      ],
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, provider: "openai", model: "gpt-5" });
});

test("preset fallback returns safe 502 without provider details", async () => {
  generateAiEnhancement.mockResolvedValue({
    source: "preset",
    text: "连接测试未通过",
    provider: "deepseek",
    model: "deepseek-chat",
    errorCode: "http",
  });

  const response = await POST(jsonRequest({ provider: "deepseek" }));

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: { code: "ai_unavailable", message: "AI 服务暂不可用" },
  });
});

test.each([
  null,
  { provider: "anthropic" },
  { provider: "openai", extra: true },
])("invalid test payload returns 400", async (body) => {
  const response = await POST(jsonRequest(body));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: { code: "invalid_request", message: "AI 服务配置无效" },
  });
});

test("invalid json returns 400", async () => {
  const response = await POST(new Request("http://localhost/api/parent/ai-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }));

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: { code: "invalid_request", message: "AI 服务配置无效" },
  });
});

test("child and anonymous sessions are rejected before parsing request json", async () => {
  state.user = { id: "child", role: "child", displayName: "孩子", isAdmin: false };

  const childResponse = await POST(new Request("http://localhost/api/parent/ai-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }));

  expect(childResponse.status).toBe(403);
  expect(await childResponse.json()).toEqual({
    error: { code: "parent_access_required", message: "只有家长可以测试 AI 服务" },
  });
  expect(generateAiEnhancement).not.toHaveBeenCalled();

  state.user = null;

  const anonymousResponse = await POST(new Request("http://localhost/api/parent/ai-test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }));

  expect(anonymousResponse.status).toBe(401);
  expect(await anonymousResponse.json()).toEqual({
    error: { code: "authentication_required", message: "请先登录家长账号" },
  });
  expect(generateAiEnhancement).not.toHaveBeenCalled();
});

test("non-admin parent is rejected before calling the provider", async () => {
  state.user = { id: "parent-2", role: "parent", displayName: "普通家长", isAdmin: false };

  const response = await POST(jsonRequest({ provider: "openai" }));

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: "admin_access_required", message: "只有管理员可以测试 AI 服务" },
  });
  expect(generateAiEnhancement).not.toHaveBeenCalled();
});
