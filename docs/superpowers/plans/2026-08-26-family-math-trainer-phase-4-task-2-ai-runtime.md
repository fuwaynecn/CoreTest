# Phase 4 Task 2 AI Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有加密配置之上提供一次基础 AI 调用、超时/错误处理、预设内容降级和家长测试连接能力。

**Architecture:** 服务端读取家长已保存的指定服务商配置，解密 Key 后调用 OpenAI-compatible `chat/completions` 接口；请求超时或异常时返回预设文本，不切换到另一服务商。家长专用测试路由使用固定无敏感提示验证连接，客户端只看到安全状态。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle/node-sqlite, Zod 4, Node `fetch`/`AbortController`, Vitest/Testing Library。

**Spec:** `docs/superpowers/specs/2026-08-19-family-math-training-web-design.md`（AI 服务设计、安全与降级边界）及用户于 2026-08-26 确认的调整范围。

## Global Constraints

- 当前只实现基础调用、超时/错误处理、预设内容降级和家长测试连接。
- 暂不实现单次/每日/月度额度、OpenAI↔DeepSeek 自动切换、主备模型、使用日志、费用统计或重试队列。
- API Key 只能在服务端解密并放入 `Authorization` 请求头；不得进入客户端 props、响应、日志、异常或测试输出。
- 没有配置、未启用、解密失败、超时、网络错误、HTTP 错误和无效响应时，核心训练不抛出阻断性错误，返回预设内容。
- 客观题判分、掌握度和排课仍由确定性规则负责，不调用 AI。
- 测试连接只允许家长会话，使用固定无敏感提示；孩子会话不得触发外部 AI 请求。
- 使用现有依赖和样式，不新增包；保持 48px 触控目标。
- 所有代码先写失败测试，再实现最小行为；每个任务聚焦验证后提交。

---

### Task 1: OpenAI-compatible 调用适配与安全降级服务

**Files:**
- Create: `web/src/services/ai/provider-client.ts`
- Create: `web/src/services/ai/provider-client.test.ts`
- Create: `web/src/services/ai/generate-ai-enhancement.ts`
- Create: `web/src/services/ai/generate-ai-enhancement.test.ts`

**Interfaces:**
- `type AiChatMessage = { role: "system" | "user" | "assistant"; content: string }`.
- `callAiProvider(input: { baseUrl: string; model: string; apiKey: string; messages: AiChatMessage[]; timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<{ text: string }>`.
- `generateAiEnhancement(db, input: { provider: AiProvider; messages: AiChatMessage[]; fallbackText: string; fetchImpl?: typeof fetch }): Promise<{ source: "ai" | "preset"; text: string; provider: AiProvider; model: string | null; errorCode?: "not_configured" | "disabled" | "decrypt_failed" | "timeout" | "network" | "http" | "invalid_response" }>`.

- [x] **Step 1: Write failing adapter/service tests**

Cover exact cases:

测试文件导入 `createTestDatabase`、`aiProviderConfigs` 和 `encryptApiKey`，使用内存数据库直接插入 disabled、无效密文和已加密 Key 的配置行；测试通过 `fetchImpl` 注入假响应，不连接真实供应商。

```ts
test("posts an OpenAI-compatible chat request with bearer auth and returns text", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "好的" } }] }), { status: 200 }));
  await expect(callAiProvider({ baseUrl: "https://example.com/v1", model: "gpt-test", apiKey: "secret", messages: [{ role: "user", content: "只回复好的" }], fetchImpl })).resolves.toEqual({ text: "好的" });
  expect(fetchImpl).toHaveBeenCalledWith("https://example.com/v1/chat/completions", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret" }) }));
});

test.each([408, 429, 500])("maps HTTP %s to a safe provider error", async (status) => {
  await expect(callAiProvider({ baseUrl: "https://example.com/v1", model: "m", apiKey: "secret", messages: [], fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status })) })).rejects.toMatchObject({ code: "http" });
});

test("maps timeout, network failure, and invalid response without exposing auth", async () => {
  const timeout = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  await expect(callAiProvider({ baseUrl: "https://example.com/v1", model: "m", apiKey: "secret", messages: [], timeoutMs: 1, fetchImpl: timeout })).rejects.toMatchObject({ code: "timeout" });
  await expect(callAiProvider({ baseUrl: "https://example.com/v1", model: "m", apiKey: "secret", messages: [], fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")) })).rejects.toMatchObject({ code: "network" });
  await expect(callAiProvider({ baseUrl: "https://example.com/v1", model: "m", apiKey: "secret", messages: [], fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 })) })).rejects.toMatchObject({ code: "invalid_response" });
});

test("returns preset text when provider is missing, disabled, or decryption fails", async () => {
  const db = createTestDatabase();
  await expect(generateAiEnhancement(db, { provider: "openai", messages: [], fallbackText: "预设" })).resolves.toMatchObject({ source: "preset", text: "预设", errorCode: "not_configured" });
  db.insert(aiProviderConfigs).values({ provider: "openai", baseUrl: "https://example.com/v1", model: "m", encryptedApiKey: null, enabled: false, createdAt: 1, updatedAt: 1 }).run();
  await expect(generateAiEnhancement(db, { provider: "openai", messages: [], fallbackText: "预设" })).resolves.toMatchObject({ source: "preset", errorCode: "disabled" });
  db.insert(aiProviderConfigs).values({ provider: "deepseek", baseUrl: "https://example.com/v1", model: "m", encryptedApiKey: "v1.invalid.invalid.invalid", enabled: true, createdAt: 1, updatedAt: 1 }).run();
  await expect(generateAiEnhancement(db, { provider: "deepseek", messages: [], fallbackText: "预设" })).resolves.toMatchObject({ source: "preset", errorCode: "decrypt_failed" });
});

test("returns AI text only for a configured enabled provider", async () => {
  const db = createTestDatabase();
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "a".repeat(32));
  db.insert(aiProviderConfigs).values({ provider: "openai", baseUrl: "https://example.com/v1", model: "m", encryptedApiKey: encryptApiKey("secret", "a".repeat(32)), enabled: true, createdAt: 1, updatedAt: 1 }).run();
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "AI 讲解" } }] }), { status: 200 }));
  await expect(generateAiEnhancement(db, { provider: "openai", messages: [{ role: "user", content: "解释" }], fallbackText: "预设", fetchImpl })).resolves.toMatchObject({ source: "ai", text: "AI 讲解", provider: "openai" });
});
```

Run:

```powershell
Set-Location web
npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts
```

Expected: FAIL because the service files do not exist.

- [x] **Step 2: Implement the minimal provider client**

Normalize trailing slashes and append `/chat/completions`; send JSON `{ model, messages, temperature: 0.2 }` with `content-type: application/json` and `Authorization: Bearer <decrypted key>`. Use a default 15,000ms `AbortController` timeout, clear the timer in `finally`, map fetch rejection/abort/HTTP/non-JSON/empty-choice failures to a typed safe error, and never include the Key in error text.

- [x] **Step 3: Implement the preset fallback service**

Read the selected row from `aiProviderConfigs`; missing row, disabled row, null Key, or decrypt failure returns `{ source: "preset", text: fallbackText, ... }`. Otherwise decrypt the Key server-side and call `callAiProvider`. Map every provider error to the same preset result with its safe `errorCode`; do not try another provider and do not write usage logs or limits.

- [x] **Step 4: Run focused tests, typecheck, and commit**

```powershell
npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts src/domain/ai/provider-config.test.ts
npm run typecheck
git add web/src/services/ai
git commit -m "feat: add basic ai provider runtime"
```

Expected: focused tests and typecheck PASS; no secret appears in output or committed fixtures.

### Task 2: 家长测试连接 Route Handler 与表单入口

**Files:**
- Create: `web/src/app/api/parent/ai-test/route.ts`
- Create: `web/src/app/api/parent/ai-test/route.test.ts`
- Modify: `web/src/components/ai-provider-config-form.tsx`
- Modify: `web/src/components/ai-provider-config-form.test.tsx`

**Interfaces:**
- `POST /api/parent/ai-test` accepts strict `{ provider: "openai" | "deepseek" }` and sends a fixed harmless message; success returns `{ ok: true, provider, model }`, failure returns 502 `{ error: { code: "ai_unavailable", message: "AI 服务暂不可用" } }`.
- Unauthenticated is 401 and child is 403 using the existing parent error shape; invalid provider/unknown fields are 400. No route response contains Key, ciphertext or model output.
- The form adds `测试 OpenAI`/`测试 DeepSeek` buttons, shows safe status text, disables only the active test button while pending, and never sends the API Key from the browser.

- [x] **Step 1: Write failing route/form tests**

Cover parent success, preset/502 failure, 401/403/400 auth and validation, and form fetch payload/status:

```ts
test("parent test route calls the selected provider without accepting a key", async () => {
  const generate = vi.mocked(generateAiEnhancement).mockResolvedValue({ source: "ai", text: "连接成功", provider: "openai", model: "gpt-5" });
  const response = await POST(jsonRequest({ provider: "openai" }));
  expect(generate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: "openai", messages: expect.any(Array) }));
  expect(await response.json()).toEqual({ ok: true, provider: "openai", model: "gpt-5" });
});

test("test route returns 502 on preset fallback and never echoes provider error details", async () => {
  vi.mocked(generateAiEnhancement).mockResolvedValue({ source: "preset", text: "连接测试未通过", provider: "deepseek", model: "deepseek-chat", errorCode: "http" });
  const response = await POST(jsonRequest({ provider: "deepseek" }));
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: { code: "ai_unavailable", message: "AI 服务暂不可用" } });
});

test("test buttons post only the provider and show success or failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, provider: "openai", model: "gpt-5" }), { status: 200 })));
  render(<AiProviderConfigForm initial={initialViews} />);
  await userEvent.click(screen.getByRole("button", { name: "测试 OpenAI" }));
  expect(fetch).toHaveBeenCalledWith("/api/parent/ai-test", expect.objectContaining({ body: JSON.stringify({ provider: "openai" }) }));
  expect(await screen.findByText("OpenAI 连接正常")).toBeInTheDocument();
});
```

Run:

```powershell
npm test -- --run src/app/api/parent/ai-test/route.test.ts src/components/ai-provider-config-form.test.tsx
```

Expected: FAIL because the route and buttons do not exist.

- [x] **Step 2: Implement the parent-only test route**

Authenticate before parsing; validate strict provider input; call `generateAiEnhancement` with a fixed system/user pair and fallback text `连接测试未通过`. Return 200 only when `source === "ai"`; map all preset results to the safe 502 body without exposing `errorCode` details or response text.

- [x] **Step 3: Add test buttons to the existing form**

Use `fetch("/api/parent/ai-test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider }) })`. Keep the replacement Key input out of this request. Show `OpenAI 连接正常`/`DeepSeek 连接正常` or `连接失败，请检查配置` in a provider-local status element; keep existing save behavior unchanged.

- [x] **Step 4: Run full verification and commit**

```powershell
npm test -- --run src/app/api/parent/ai-test/route.test.ts src/components/ai-provider-config-form.test.tsx src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts
npm run lint
npm run typecheck
npm run test:run
npm run build
git diff --check
git add web/src/app/api/parent/ai-test web/src/components/ai-provider-config-form.tsx web/src/components/ai-provider-config-form.test.tsx
git commit -m "feat: add parent ai connection test"
```

Expected: all tests, lint, typecheck, build and diff check PASS. No quota, cross-provider fallback, primary/backup model or usage-log code is present.

## Completion Checklist

- [x] Specified provider calls use the stored model/base URL and server-only decrypted Key.
- [x] Timeout/network/HTTP/invalid-response/missing-config cases return preset content.
- [x] Parent can test one selected provider from the configuration form.
- [x] Child cannot trigger the test route.
- [x] No quotas, provider switching, primary/backup model, usage logs or cost accounting were added.
- [x] Existing core workflow and all current tests remain green.
