# 家庭数学训练 Phase 4 Task 3：PWA、离线与中断恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**目标：** 让平板端可安装为 PWA，并在短暂断网、刷新或意外退出时保留作答，联网后安全恢复提交。

**架构：** 使用浏览器原生 `localStorage` 保存短文本草稿和最小待同步请求队列；服务端仍是判分、诊断进度、掌握度和奖励的唯一权威。Service Worker 仅缓存同源静态资源，不拦截或缓存 API 与个性化响应。

**技术栈：** Next.js 16 App Router、React 19、TypeScript、原生 Service Worker、`localStorage`、Vitest/Testing Library。

**规格：** `docs/superpowers/specs/2026-08-26-family-math-trainer-phase-4-task-3-pwa-offline-recovery-design.md`

## 全局约束

- 不新增第三方 PWA/IndexedDB 依赖。
- 不缓存 API、认证信息、Key、服务端响应或完整身份资料。
- 网络异常才入队；400/401/403/404 等确定性错误不入队。
- 重试始终复用已有 `clientSubmissionId`，不得伪造判分结果。
- 保持 48px 最小触控目标；不影响现有在线流程。

---

### Task 1：本地草稿与待同步队列服务

**文件：**

- 新建：`web/src/services/offline/offline-store.ts`
- 新建：`web/src/services/offline/offline-store.test.ts`

**接口：**

```ts
export type DraftRecord = {
  sessionItemId: string;
  answerText?: string;
  readingCardResponse?: Record<string, string>;
  updatedAt: number;
};

export type QueuedSubmission = {
  id: string;
  endpoint: "/api/child/attempts" | "/api/child/diagnosis";
  body: string;
  clientSubmissionId: string;
  createdAt: number;
};

export function readDraft(sessionItemId: string): DraftRecord | null;
export function writeDraft(record: DraftRecord): void;
export function clearDraft(sessionItemId: string): void;
export function enqueueSubmission(item: QueuedSubmission): void;
export function readSubmissionQueue(): QueuedSubmission[];
export function removeSubmission(id: string): void;
```

- [ ] **Step 1：先写失败测试**

覆盖草稿按题目隔离、无效 JSON 安全返回空、队列按 `createdAt` 排序、重复 `id` 覆盖、localStorage 异常不抛出，以及 API Key/响应字段不会被写入。

- [ ] **Step 2：实现最小存储服务**

使用固定前缀键保存 JSON；只接受两个允许的 endpoint；读取时验证字段类型；存储不可用时返回空或静默跳过，保证在线流程不被阻断。

- [ ] **Step 3：运行聚焦测试并提交**

```powershell
Set-Location web
npm test -- --run src/services/offline/offline-store.test.ts
git add src/services/offline
git commit -m "feat: add offline draft and submission store"
```

---

### Task 2：训练表单接入恢复与网络状态提示

**文件：**

- 新建：`web/src/components/offline-status.tsx`
- 新建：`web/src/components/offline-status.test.tsx`
- 修改：`web/src/components/answer-form.tsx`
- 修改：`web/src/components/answer-form.test.tsx`
- 修改：`web/src/components/diagnosis-answer-form.tsx`
- 修改：`web/src/components/diagnosis-answer-form.test.tsx`

**接口与行为：**

- `OfflineStatus` 监听 `online`/`offline` 事件，显示在线、离线、同步中、同步失败四种安全文案。
- 两个表单在输入变化时保存草稿，首次 hydration 时恢复当前题目的草稿。
- 提交函数遇到网络/未知响应时，将原始请求体和原 `clientSubmissionId` 入队，保留输入并显示“已暂存，网络恢复后会自动提交”。
- 400/401/403/404 继续使用现有确定性错误流程，不入队。
- `online` 事件触发队列顺序发送；2xx 删除，确定性 4xx 删除并显示失败，其他失败保留。
- 页面会话成功完成后清理对应草稿。

- [ ] **Step 1：先写失败测试**

覆盖两个表单的草稿恢复、网络失败入队且复用提交标识、确定性 4xx 不入队、联网后按顺序发送，以及状态条事件文案。

- [ ] **Step 2：实现最小接入**

复用现有提交函数和错误分类；只在 `postAttempt`/`postDiagnosisAnswer` 的不确定失败路径入队，避免改变在线成功结果和服务端判分。

- [ ] **Step 3：运行聚焦测试并提交**

```powershell
Set-Location web
npm test -- --run src/components/offline-status.test.tsx src/components/answer-form.test.tsx src/components/diagnosis-answer-form.test.tsx
npm run lint
npm run typecheck
git add src/components
git commit -m "feat: recover offline child submissions"
```

---

### Task 3：PWA 应用壳与全局注册

**文件：**

- 新建：`web/public/manifest.webmanifest`
- 新建：`web/public/sw.js`
- 新建：`web/src/components/pwa-register.tsx`
- 新建：`web/src/components/pwa-register.test.tsx`
- 修改：`web/src/app/layout.tsx`
- 修改：`web/src/app/globals.css`

**接口与行为：**

- manifest 设置中文应用名称、`standalone` 模式、`start_url: "/child"` 和现有主题色。
- Service Worker 安装并缓存最小静态壳；fetch 对 `/api/`、登录和跨源请求直接放行，不写入缓存。
- `PwaRegister` 仅在浏览器注册 `/sw.js`，注册失败不阻断页面。
- layout 挂载 `PwaRegister` 和 `OfflineStatus`；状态条不遮挡主要答题区域。

- [ ] **Step 1：先写失败测试**

验证组件只在浏览器注册 Service Worker，失败不抛出；验证 manifest 必需字段；验证 Service Worker 源码明确跳过 API 和跨源请求。

- [ ] **Step 2：实现最小 PWA 壳**

只缓存同源静态资源，避免缓存个性化响应；不添加安装弹窗和新依赖。

- [ ] **Step 3：运行全量验证并提交**

```powershell
Set-Location web
npm run lint
npm run typecheck
npm run test:run
npm run build
git diff --check
git add src/app src/components/pwa-register.tsx public
git commit -m "feat: add installable pwa shell"
```

## 完成检查

- [ ] 平板可发现并安装 PWA，静态应用壳可加载。
- [ ] 断网时答案、审题卡和草稿不丢失。
- [ ] 恢复联网后按序重试，复用同一 `clientSubmissionId`。
- [ ] 确定性错误不进入队列，未保存内容不显示为已完成。
- [ ] 不缓存 API、Key 或服务端响应。
- [ ] 现有核心流程、全量测试和生产构建通过。
