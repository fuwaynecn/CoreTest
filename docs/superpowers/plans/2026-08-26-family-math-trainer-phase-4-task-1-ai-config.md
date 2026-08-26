# Phase 4 Task 1 AI 配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让家长在页面安全配置 OpenAI/DeepSeek 的 API 地址、模型和 API Key，并在不配置 AI 时保持核心训练可用。

**Architecture:** 在现有 Next.js 单体应用中新增 `ai_provider_configs` SQLite 表和一个服务端 AI 配置服务。API Key 使用 Node `crypto` 的 AES-256-GCM 加密，环境变量 `AI_CONFIG_ENCRYPTION_KEY` 只作为加密主密钥；家长专用 Route Handler 返回掩码视图，客户端表单只提交新 Key。Task 1 不发起外部 AI 请求，也不实现限额、超时、重试或降级。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM/node-sqlite, SQLite, Zod 4, Node `node:crypto`, Vitest/Testing Library。

**Spec:** `docs/superpowers/specs/2026-08-26-family-math-trainer-phase-4-task-1-ai-config-design.md`

## Global Constraints

- 家长可以修改 OpenAI/DeepSeek 的地址、模型名和 API Key，不需要修改代码。
- API Key 在服务器端加密保存，任何接口都不得把完整密钥返回浏览器。
- `AI_CONFIG_ENCRYPTION_KEY` 不写入数据库、前端构建产物或 Git。
- 未配置 API Key 时，训练、判分、排课和报告仍然正常工作。
- 孩子会话不能读取或修改 AI 配置。
- Task 1 不加入限额、使用日志、默认/备用模型、外部 AI 调用和 PWA/部署工作。
- 修改前先阅读 `web/AGENTS.md` 指向的 Next.js 相关文档；遵循现有 `requireRole`、Drizzle migration 和测试数据库模式。
- 所有代码变更先写失败测试，再写最小实现；每个任务完成后运行其聚焦测试并提交一次。

---

### Task 1: 加密领域逻辑、数据库表和迁移

**Files:**
- Create: `web/src/domain/ai/provider-config.ts`
- Create: `web/src/domain/ai/provider-config-crypto.ts`
- Create: `web/src/domain/ai/provider-config.test.ts`
- Modify: `web/src/db/schema.ts`（新增 `aiProviderConfigs`）
- Modify: `web/src/db/schema.test.ts`（验证新增表、主键和迁移兼容性）
- Create: `web/drizzle/20260826120000_ai_provider_config/migration.sql`（由 Drizzle 生成；若命令生成当前时间戳目录，使用生成的同名目录）
- Create: `web/drizzle/20260826120000_ai_provider_config/snapshot.json`（由 Drizzle 生成；若命令生成当前时间戳目录，使用生成的同名目录）

**Interfaces:**
- `provider-config-crypto.ts` exports `encryptApiKey(apiKey: string, masterSecret?: string): string` and `decryptApiKey(envelope: string, masterSecret?: string): string`.
- `provider-config.ts` exports `AI_PROVIDERS`, `type AiProvider`, `type AiProviderConfigRecord`, `maskApiKey(apiKey: string): string`, and `validateAiProviderConfig(input: unknown): ValidatedAiProviderConfig`.
- `aiProviderConfigs` has one row per provider, keyed by `provider`, with `baseUrl`, `model`, nullable `encryptedApiKey`, boolean `enabled`, and millisecond `createdAt`/`updatedAt`.

- [ ] **Step 1: Read the required Next.js route-handler guidance and inspect current migration naming**

Run:

```powershell
Get-Content -Raw web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
Get-ChildItem web/drizzle -Directory | Sort-Object Name | Select-Object -Last 3
```

Expected: the route-handler guidance is available and the existing migration directories show the current timestamp/name convention.

- [ ] **Step 2: Write failing crypto and domain tests**

Add tests covering the exact public behavior:

```ts
test("encrypts and decrypts with the same master secret", () => {
  const encrypted = encryptApiKey("sk-test-value", "a".repeat(32));
  expect(encrypted).not.toContain("sk-test-value");
  expect(decryptApiKey(encrypted, "a".repeat(32))).toBe("sk-test-value");
});

test("rejects a wrong master secret and tampered envelope", () => {
  const encrypted = encryptApiKey("secret", "a".repeat(32));
  expect(() => decryptApiKey(encrypted, "b".repeat(32))).toThrow();
  expect(() => decryptApiKey(`${encrypted}x`, "a".repeat(32))).toThrow();
});

test("masks a key without exposing its prefix", () => {
  expect(maskApiKey("sk-test-value")).toBe("••••••alue");
  expect(maskApiKey("")).toBe("");
});

test("accepts only the supported providers and web URLs", () => {
  expect(validateAiProviderConfig({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5", enabled: true }))
    .toMatchObject({ provider: "openai", model: "gpt-5" });
  expect(() => validateAiProviderConfig({ provider: "other", baseUrl: "https://example.com", model: "x", enabled: true })).toThrow();
  expect(() => validateAiProviderConfig({ provider: "deepseek", baseUrl: "file:///tmp/key", model: "x", enabled: true })).toThrow();
});
```

Run:

```powershell
Set-Location web
npm test -- --run src/domain/ai/provider-config.test.ts
```

Expected: FAIL because the new modules and table do not exist.

在同一轮测试中，在 `schema.test.ts` 增加一个迁移断言：`PRAGMA table_info('ai_provider_configs')` 必须包含 `provider`、`base_url`、`model`、`encrypted_api_key`、`enabled`、`created_at` 和 `updated_at`，且 `provider` 是唯一主键；对已有测试数据库执行最新迁移后，已有 attempts 数量不变。

- [ ] **Step 3: Implement the minimal crypto envelope and validation**

Use `node:crypto` AES-256-GCM with a fresh 12-byte nonce for every encryption. Derive a 32-byte cipher key from the supplied secret with SHA-256; when no argument is supplied, read `process.env.AI_CONFIG_ENCRYPTION_KEY`. Reject missing or shorter-than-32-character master secrets. Encode the envelope as `v1.<nonce base64url>.<ciphertext base64url>.<tag base64url>` and reject unknown versions, malformed segments, authentication failures, invalid provider values, non-http(s) URLs, blank/overlong model names, and unknown fields. `maskApiKey` returns six bullets plus the final four characters, or an empty string for an empty key.

- [ ] **Step 4: Add the Drizzle table definition**

Add this shape to `web/src/db/schema.ts`:

```ts
export const aiProviderConfigs = sqliteTable("ai_provider_configs", {
  provider: text("provider", { enum: ["openai", "deepseek"] }).primaryKey(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  encryptedApiKey: text("encrypted_api_key"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

- [ ] **Step 5: Run the domain tests and generate the migration**

Run:

```powershell
Set-Location web
npm test -- --run src/domain/ai/provider-config.test.ts
npm run db:generate
```

Expected: domain tests PASS; `drizzle/` contains one new migration creating `ai_provider_configs` with `provider` as its primary key and no changes to existing tables.

- [ ] **Step 6: Verify the migration on the test database and commit**

Run:

```powershell
npm test -- --run src/db/schema.test.ts src/db/client.test.ts
git add web/src/domain/ai/provider-config.ts web/src/domain/ai/provider-config-crypto.ts web/src/domain/ai/provider-config.test.ts web/src/db/schema.ts web/drizzle
git commit -m "feat: add encrypted ai provider config storage"
```

Expected: migration and existing schema tests PASS; commit contains no `.env` file, database file, plaintext Key, or generated secret.

### Task 2: 家长配置服务和 Route Handler

**Files:**
- Create: `web/src/services/parent/ai-provider-config.ts`
- Create: `web/src/app/api/parent/ai-config/route.ts`
- Create: `web/src/app/api/parent/ai-config/route.test.ts`

**Interfaces:**
- `listAiProviderConfigs(db): AiProviderConfigView[]` always returns the two providers in `AI_PROVIDERS` order, using `hasApiKey` and `apiKeyMasked` without decrypting for the view.
- `saveAiProviderConfig(db, input): AiProviderConfigView` upserts one row, encrypts a supplied replacement Key, retains the old encrypted Key when `apiKey` is omitted, and clears it only when `clearApiKey` is true.
- `AiProviderConfigView` is `{ provider, baseUrl, model, enabled, hasApiKey, apiKeyMasked, updatedAt }`.
- `GET /api/parent/ai-config` returns `{ providers: AiProviderConfigView[] }`.
- `POST /api/parent/ai-config` accepts strict JSON `{ provider, baseUrl, model, enabled, apiKey?: string, clearApiKey?: boolean }` and returns `{ provider: AiProviderConfigView }`.

- [ ] **Step 1: Write failing service and route tests**

Use `createTestDatabase()` and mock `getCurrentUser()` following `web/src/app/api/parent/preferences/route.test.ts`. The tests must perform these concrete assertions:

```ts
test("lists both providers without exposing a key", async () => {
  const response = await GET(new Request("http://localhost/api/parent/ai-config"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.providers).toHaveLength(2);
  expect(body.providers[0]).toMatchObject({ provider: "openai", hasApiKey: true, apiKeyMasked: "••••••-key" });
  expect(body.providers[0]).not.toHaveProperty("encryptedApiKey");
});

test("parent can create, retain, disable, and clear a key", async () => {
  const create = await POST(jsonRequest({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5", enabled: true, apiKey: "secret-key" }));
  expect(create.status).toBe(200);
  const retain = await POST(jsonRequest({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", enabled: false }));
  expect(retain.json()).resolves.toMatchObject({ provider: { model: "gpt-5-mini", enabled: false, hasApiKey: true } });
  const clear = await POST(jsonRequest({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", enabled: false, clearApiKey: true }));
  expect(clear.json()).resolves.toMatchObject({ provider: { hasApiKey: false, apiKeyMasked: "" } });
});

test("child and anonymous sessions are rejected", async () => {
  state.user = { id: "child", role: "child", displayName: "孩子" };
  expect((await GET(new Request("http://localhost/api/parent/ai-config"))).status).toBe(403);
  state.user = null;
  expect((await GET(new Request("http://localhost/api/parent/ai-config"))).status).toBe(401);
});

test("invalid provider, URL, unknown field, and conflicting key operations return 400", async () => {
  for (const body of [
    { provider: "other", baseUrl: "https://example.com", model: "x", enabled: true },
    { provider: "openai", baseUrl: "file:///tmp/key", model: "x", enabled: true },
    { provider: "openai", baseUrl: "https://example.com", model: "x", enabled: true, extra: true },
    { provider: "openai", baseUrl: "https://example.com", model: "x", enabled: true, apiKey: "new", clearApiKey: true },
  ]) expect((await POST(jsonRequest(body))).status).toBe(400);
});

test("missing encryption master secret returns a safe configuration error", async () => {
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "");
  const response = await POST(jsonRequest({ provider: "openai", baseUrl: "https://example.com", model: "x", enabled: true, apiKey: "secret" }));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});
```

Run:

```powershell
npm test -- --run src/app/api/parent/ai-config/route.test.ts
```

Expected: FAIL because the service and route do not exist.

- [ ] **Step 2: Implement the service with an allowlisted two-provider view**

Query rows by provider, map them to `AiProviderConfigView`, and synthesize an unconfigured row for any missing provider. Use `db.insert(aiProviderConfigs).values(...).onConflictDoUpdate(...)` for upsert. Never include `encryptedApiKey` in the returned object. On a replacement Key, call `encryptApiKey`; on omission, preserve the existing value; on `clearApiKey`, store `null`.

- [ ] **Step 3: Implement the parent-only route**

Use `getCurrentUser()`. Return 401 for no session, 403 for a non-parent role, 400 for strict Zod failures, 503 for a missing/invalid master secret, and 200 for successful GET/POST. Parse invalid JSON as the same 400 `invalid_request`. Do not log the request body or include Key material in any response.

- [ ] **Step 4: Run focused tests, typecheck, and commit**

Run:

```powershell
npm test -- --run src/app/api/parent/ai-config/route.test.ts src/domain/ai/provider-config.test.ts
npm run typecheck
git add web/src/services/parent/ai-provider-config.ts web/src/app/api/parent/ai-config
git commit -m "feat: add parent ai config api"
```

Expected: all focused tests and typecheck PASS; response snapshots contain no full Key or ciphertext.

### Task 3: 家长页面配置表单

**Files:**
- Create: `web/src/components/ai-provider-config-form.tsx`
- Create: `web/src/components/ai-provider-config-form.test.tsx`
- Modify: `web/src/app/parent/page.tsx`
- Modify: `web/src/app/globals.css`
- Modify: `web/README.md`（只记录 `AI_CONFIG_ENCRYPTION_KEY` 的变量名与用途，不写入任何值）

**Interfaces:**
- `AiProviderConfigForm` receives `initial: AiProviderConfigView[]` and renders one fieldset per provider.
- The component submits only to `/api/parent/ai-config`, keeps a replacement Key in local component state, never pre-fills it, and updates the masked state from the response.
- Parent page obtains `initial` by calling `listAiProviderConfigs(getDatabase())`; no secret-bearing value enters server-rendered props.

- [ ] **Step 1: Write failing component and parent-page tests**

Add Testing Library coverage for these concrete interactions:

```ts
test("renders both providers, editable address/model, masked key, and enabled switch", () => {
  render(<AiProviderConfigForm initial={initialViews} />);
  expect(screen.getByRole("group", { name: "OpenAI" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "DeepSeek" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("gpt-5")).toBeInTheDocument();
  expect(screen.getByText("••••••-key")).toBeInTheDocument();
});

test("submits a replacement key without pre-filling the old key", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ provider: { ...initialViews[0], hasApiKey: true, apiKeyMasked: "••••••new" } })));
  render(<AiProviderConfigForm initial={initialViews} />);
  const keyInput = screen.getByLabelText("OpenAI API Key（更换时填写）");
  expect(keyInput).toHaveValue("");
  await userEvent.type(keyInput, "new-key");
  await userEvent.click(screen.getByRole("button", { name: "保存 OpenAI" }));
  expect(fetch).toHaveBeenCalledWith("/api/parent/ai-config", expect.objectContaining({ body: expect.stringContaining('"apiKey":"new-key"') }));
});

test("supports clearing a key and shows a safe error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<AiProviderConfigForm initial={initialViews} />);
  await userEvent.click(screen.getByLabelText("清除 OpenAI API Key"));
  await userEvent.click(screen.getByRole("button", { name: "保存 OpenAI" }));
  expect(fetch).toHaveBeenCalledWith("/api/parent/ai-config", expect.objectContaining({ body: expect.stringContaining('"clearApiKey":true') }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络连接失败");
});
```

Run:

```powershell
npm test -- --run src/components/ai-provider-config-form.test.tsx src/app/parent/page.test.tsx
```

Expected: FAIL because the component and page section do not exist.

- [ ] **Step 2: Implement the smallest accessible form**

Use a client component with labels for service provider, API address, model name, API Key replacement, clear Key, and enabled state. Keep API Key input `type="password"`, `autoComplete="new-password"`, blank by default, and clear it after a successful save. Show only `apiKeyMasked`/`hasApiKey` from the server. Use a single `role="alert"` for validation/network errors and a success message that does not include submitted values.

- [ ] **Step 3: Add the section to the parent page and responsive CSS**

Load the two non-sensitive views server-side and render the form in the parent dashboard (including the no-child empty state). Reuse existing `.parentSection`, button, label, and alert styles; add only the grid/fieldset rules needed for tablet/phone layouts and preserve the existing 48px touch target minimum. Add one `AI_CONFIG_ENCRYPTION_KEY` row to `web/README.md`'s environment table, describing it as a deployment-only secret with a minimum length of 32 characters; do not write a value or example secret.

- [ ] **Step 4: Run focused tests, full verification, and commit**

Run:

```powershell
npm test -- --run src/components/ai-provider-config-form.test.tsx src/app/parent/page.test.tsx src/app/api/parent/ai-config/route.test.ts
npm run lint
npm run typecheck
npm run test:run
npm run build
git add web/src/components/ai-provider-config-form.tsx web/src/components/ai-provider-config-form.test.tsx web/src/app/parent/page.tsx web/src/app/globals.css
git commit -m "feat: add parent ai config form"
```

Expected: focused tests, full Vitest suite, lint, typecheck and production build PASS. No Key or ciphertext appears in rendered HTML, test output, or committed files.

## Completion Checklist

- [ ] `AI_CONFIG_ENCRYPTION_KEY` is documented only as a deployment secret name; no secret value is committed.
- [ ] Parent can configure OpenAI and DeepSeek address/model/Key from the parent page.
- [ ] GET/POST responses contain only masked Key metadata.
- [ ] Child and anonymous sessions cannot access the route.
- [ ] No AI request, limit, fallback, usage log, PWA, deployment, or monitoring code was added.
- [ ] Existing core workflow remains usable without any AI row or API Key.
