# Family Math Trainer Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working vertical slice: a child signs in, completes a deterministic three-question session, receives correction feedback, and a parent signs in to view the recorded evidence.

**Architecture:** A single Next.js App Router application lives in `web/`. Server routes and server-only modules own authentication, SQLite persistence, scoring, and session creation; React components render separate child and parent experiences. The first phase deliberately proves one complete learning loop before adding diagnosis, adaptive dosage, the full question bank, AI, rewards, offline recovery, and deployment automation.

**Tech Stack:** Node.js 24.x, npm, Next.js App Router, React, TypeScript, Drizzle ORM with Node's built-in SQLite driver, Zod, Vitest, Testing Library, and Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-family-math-training-web-design.md`

## Global Constraints

- The first release serves one family with exactly two roles: `parent` and `child`.
- The child experience is designed for a tablet landscape viewport; the parent experience must also work at a phone viewport.
- Core scoring and learning-state changes are deterministic; AI cannot decide objective answers or mastery.
- The application must remain usable when no AI provider is configured.
- Accuracy is rewarded before speed; Phase 1 must not show rankings or speed-based rewards.
- Credentials and session tokens never appear in client-side logs or browser-readable storage.
- Use Node.js 24.x; the current workspace has Node `v24.18.0` and npm `11.16.0`.
- Use npm and commit `web/package-lock.json` for reproducible installs.
- Use `node:sqlite`; Docker is not available in the current workspace.
- Keep the codebase a single deployable application; do not introduce microservices, queues, or multi-tenant abstractions.
- Before the first commit, the user must configure repository-local Git `user.name` and `user.email`; do not invent an identity.

---

## Delivery Sequence Beyond Phase 1

The approved specification contains four separately reviewable increments. This document gives executable detail for Phase 1 only; each later increment receives its own plan after the preceding increment passes acceptance.

1. **Phase 1 — Working learning loop:** authentication, database, deterministic questions, one child session, correction, and parent evidence.
2. **Phase 2 — Learning engine:** three-part diagnosis, mastery states, 1/3/7/14/30-day review scheduling, computation and equation dosage, error taxonomy, and six-week plans.
3. **Phase 3 — Complete experience and content:** 100–150 reviewed templates, rule-based variants, scratchpad, review cards, ability map, weekly report, points, badges, and tablet polish.
4. **Phase 4 — AI, resilience, and public operation:** encrypted OpenAI/DeepSeek configuration, provider limits and fallback, PWA installation, interrupted-session recovery, backups, cloud deployment, and operational monitoring.

This split preserves a usable, testable product at every boundary and avoids building the large content and AI subsystems before the central training loop is proven.

## Phase 1 File Map

```text
web/
  src/app/
    api/auth/login/route.ts          # Starts a server-side session
    api/auth/logout/route.ts         # Ends a server-side session
    api/child/attempts/route.ts      # Accepts one idempotent answer submission
    child/page.tsx                   # Child's current-session entry
    child/session/[id]/page.tsx      # Tablet training screen
    login/page.tsx                   # Two-role sign-in screen
    parent/page.tsx                  # Parent evidence dashboard
    layout.tsx                       # Shared document shell
    page.tsx                         # Role-aware landing page
    globals.css                      # Small shared visual system
  src/components/
    answer-form.tsx                  # Client answer interaction
    question-card.tsx                # Accessible question display
    session-progress.tsx             # Current item progress
  src/db/
    client.ts                        # Node SQLite and Drizzle connection factory
    migrate.ts                       # Applies checked-in migrations
    schema.ts                        # Phase 1 relational schema
    seed.ts                          # Creates two users and reviewed seed questions
  src/domain/auth/
    credentials.ts                   # scrypt hash and verification
    session-token.ts                 # Random token generation and hashing
  src/domain/questions/
    answer-spec.ts                   # Zod schema and TypeScript answer types
    score-answer.ts                  # Deterministic scoring
  src/domain/training/
    mastery.ts                       # Minimal evidence update rule
    types.ts                         # Shared session and attempt contracts
  src/lib/auth/
    current-user.ts                  # Cookie lookup and role guard
  src/services/training/
    create-daily-session.ts          # Creates or reuses today's session
    get-parent-evidence.ts           # Parent dashboard query
    submit-attempt.ts                # Transactional, idempotent submission
  src/test/
    setup.ts                         # Testing Library matchers
    test-db.ts                       # Migrated temporary SQLite database
  e2e/
    learning-loop.spec.ts            # Child-to-parent browser flow
  drizzle/                           # Generated SQL migrations
  scripts/seed-e2e.ts                # Repeatable E2E database seed
  drizzle.config.ts
  playwright.config.ts
  vitest.config.mts
```

---

### Task 1: Application Shell and Test Harness

**Files:**
- Create: `web/` using the Next.js scaffold
- Create: `web/vitest.config.mts`
- Create: `web/src/test/setup.ts`
- Create: `web/src/app/page.test.tsx`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/globals.css`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: none
- Produces: npm scripts `test`, `test:run`, `typecheck`, and `verify`; a root application shell used by every later page

- [ ] **Step 1: Scaffold the application in `web/`**

Run from the repository root:

```powershell
npx create-next-app@latest web --ts --eslint --app --src-dir --import-alias "@/*" --use-npm --no-tailwind
Set-Location web
npm install zod drizzle-orm@rc
npm install --save-dev drizzle-kit@rc vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test tsx
```

Expected: `web/package.json`, `web/package-lock.json`, and `web/src/app/` exist; installation exits with code 0.

- [ ] **Step 2: Add the failing shell test**

Create `web/src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import Home from "./page";

test("presents the family math trainer entry", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "每天认真一点，数学更稳一点" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "进入系统" })).toHaveAttribute("href", "/login");
});
```

Create `web/src/test/setup.ts`:

```ts
/// <reference types="vitest/globals" />
import "@testing-library/jest-dom/vitest";
```

Create `web/vitest.config.mts`:

```ts
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { globals: true, environment: "jsdom", setupFiles: ["./src/test/setup.ts"] },
});
```

- [ ] **Step 3: Run the test and verify the scaffold does not satisfy it**

Run:

```powershell
npx vitest run src/app/page.test.tsx
```

Expected: FAIL because the scaffold does not contain the Chinese heading or `/login` link.

- [ ] **Step 4: Implement the minimal shell**

Replace `web/src/app/page.tsx` with:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <p className="eyebrow">家庭数学训练</p>
      <h1>每天认真一点，数学更稳一点</h1>
      <p>用大约三十分钟完成审题、计算、订正和回顾。</p>
      <Link className="primaryButton" href="/login">进入系统</Link>
    </main>
  );
}
```

Set `web/src/app/layout.tsx` metadata title to `家庭数学训练`, keep the generated font handling, and render children inside `<body>{children}</body>`.

Replace decorative scaffold rules in `web/src/app/globals.css` with a small token set and tablet-safe defaults:

```css
:root { color-scheme: light; --ink: #24312f; --paper: #fbfaf6; --brand: #236b62; --sand: #e6dccb; }
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); }
body { margin: 0; font-family: Arial, "Microsoft YaHei", sans-serif; }
a { color: inherit; }
button, input { font: inherit; }
.landing { min-height: 100dvh; display: grid; place-content: center; gap: 1rem; padding: 2rem; text-align: center; }
.eyebrow { color: var(--brand); font-weight: 700; }
.primaryButton { display: inline-block; justify-self: center; padding: .9rem 1.4rem; border-radius: .75rem; background: var(--brand); color: white; text-decoration: none; }
```

- [ ] **Step 5: Add verification scripts**

Merge these scripts into `web/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit",
    "verify": "npm run lint && npm run typecheck && npm run test:run && npm run build"
  }
}
```

- [ ] **Step 6: Verify the application shell**

Run:

```powershell
npm run verify
```

Expected: lint, typecheck, one unit test, and production build all pass.

- [ ] **Step 7: Commit the shell**

After the user has configured repository-local Git identity:

```powershell
git add web
git commit -m "feat: scaffold family math trainer"
```

---

### Task 2: SQLite Schema and Migration

**Files:**
- Create: `web/src/db/schema.ts`
- Create: `web/src/db/client.ts`
- Create: `web/src/db/migrate.ts`
- Create: `web/src/test/test-db.ts`
- Create: `web/src/db/schema.test.ts`
- Create: `web/drizzle.config.ts`
- Create: `web/.env.example`
- Create: `web/drizzle/*`
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `DB_FILE_NAME: string`
- Produces: `createDatabase(filename: string): AppDatabase`, `migrateDatabase(db, migrationsFolder): void`, and tables exported from `@/db/schema`

- [ ] **Step 1: Write the failing database test**

Create `web/src/db/schema.test.ts`:

```ts
import { users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";

test("stores one parent and one child", () => {
  const db = createTestDatabase();
  db.insert(users).values([
    { id: "parent-1", role: "parent", displayName: "家长", credentialHash: "hash-a", createdAt: 1 },
    { id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash-b", createdAt: 1 },
  ]).run();

  expect(db.select().from(users).all().map((row) => row.role).sort()).toEqual(["child", "parent"]);
});
```

- [ ] **Step 2: Run the database test to verify it fails**

Run:

```powershell
npx vitest run src/db/schema.test.ts
```

Expected: FAIL because `@/db/schema` and `@/test/test-db` do not exist.

- [ ] **Step 3: Define the Phase 1 schema**

Create `web/src/db/schema.ts` with these exported tables and exact columns:

```ts
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  role: text("role", { enum: ["parent", "child"] }).notNull(),
  displayName: text("display_name").notNull(),
  credentialHash: text("credential_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [uniqueIndex("auth_sessions_token_hash_idx").on(table.tokenHash)]);

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
});

export const questionTemplates = sqliteTable("question_templates", {
  id: text("id").primaryKey(),
  skillId: text("skill_id").notNull().references(() => skills.id),
  stem: text("stem").notNull(),
  answerSpec: text("answer_spec").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const trainingSessions = sqliteTable("training_sessions", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  sessionDate: text("session_date").notNull(),
  status: text("status", { enum: ["in_progress", "completed"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [uniqueIndex("one_session_per_child_day").on(table.childId, table.sessionDate)]);

export const sessionItems = sqliteTable("session_items", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  questionTemplateId: text("question_template_id").notNull().references(() => questionTemplates.id),
  position: integer("position").notNull(),
});

export const attempts = sqliteTable("attempts", {
  id: text("id").primaryKey(),
  sessionItemId: text("session_item_id").notNull().references(() => sessionItems.id),
  clientSubmissionId: text("client_submission_id").notNull().unique(),
  answerText: text("answer_text").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
  submittedAt: integer("submitted_at").notNull(),
});

export const masteryStates = sqliteTable("mastery_states", {
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  status: text("status", { enum: ["needs_support", "learning", "basic"] }).notNull(),
  evidenceCount: integer("evidence_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.childId, table.skillId] })]);
```

- [ ] **Step 4: Create database factories and migration support**

Create `web/src/db/client.ts`:

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import * as schema from "./schema";

export function createDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  return drizzle({ client: new DatabaseSync(filename), schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;
export const db = createDatabase(process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite");
```

Create `web/src/db/migrate.ts`:

```ts
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import type { AppDatabase } from "./client";

export function migrateDatabase(db: AppDatabase, migrationsFolder: string) {
  migrate(db, { migrationsFolder });
}
```

Create `web/src/test/test-db.ts`:

```ts
import path from "node:path";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";

export function createTestDatabase() {
  const db = createDatabase(":memory:");
  migrateDatabase(db, path.resolve(process.cwd(), "drizzle"));
  return db;
}
```

- [ ] **Step 5: Configure and generate the first migration**

Create `web/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite" },
});
```

Add to `web/package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate"
  }
}
```

Run:

```powershell
npm run db:generate
npx vitest run src/db/schema.test.ts
```

Expected: a checked-in SQL migration is generated and the database test passes.

- [ ] **Step 6: Add configuration documentation**

Create `web/.env.example`:

```dotenv
DB_FILE_NAME=data/math-trainer.sqlite
SESSION_COOKIE_SECURE=false
```

- [ ] **Step 7: Verify and commit database foundation**

Run:

```powershell
npm run test:run
npm run typecheck
git add web/src/db web/src/test web/drizzle web/drizzle.config.ts web/.env.example web/package.json web/package-lock.json
git commit -m "feat: add family learning data model"
```

Expected: tests and typecheck pass; the commit contains no `.env` or SQLite database file.

---

### Task 3: Two-Role Authentication

**Files:**
- Create: `web/src/domain/auth/credentials.ts`
- Create: `web/src/domain/auth/credentials.test.ts`
- Create: `web/src/domain/auth/session-token.ts`
- Create: `web/src/lib/auth/current-user.ts`
- Create: `web/src/app/api/auth/login/route.ts`
- Create: `web/src/app/api/auth/logout/route.ts`
- Create: `web/src/app/login/page.tsx`
- Create: `web/src/app/login/login-form.tsx`
- Create: `web/src/db/seed.ts`
- Modify: `web/src/app/page.tsx`

**Interfaces:**
- Consumes: `users`, `authSessions`, and `AppDatabase`
- Produces: `hashCredential(value: string): Promise<string>`, `verifyCredential(value, encoded): Promise<boolean>`, `createSessionToken(): { raw: string; hash: string }`, and `requireRole(role): Promise<CurrentUser>`

- [ ] **Step 1: Write failing credential tests**

Create `web/src/domain/auth/credentials.test.ts`:

```ts
import { hashCredential, verifyCredential } from "./credentials";

test("verifies the original credential and rejects a different value", async () => {
  const encoded = await hashCredential("safe-parent-password");
  expect(await verifyCredential("safe-parent-password", encoded)).toBe(true);
  expect(await verifyCredential("wrong-password", encoded)).toBe(false);
  expect(encoded).not.toContain("safe-parent-password");
});
```

- [ ] **Step 2: Run the credential test to verify it fails**

Run `npx vitest run src/domain/auth/credentials.test.ts`.

Expected: FAIL because `credentials.ts` does not exist.

- [ ] **Step 3: Implement credential and token primitives**

Create `web/src/domain/auth/credentials.ts` using `node:crypto` `scrypt`, a 16-byte random salt, a 64-byte derived key, and `timingSafeEqual`. Encode values as `scrypt:<salt-hex>:<key-hex>` and reject any other format.

Create `web/src/domain/auth/session-token.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

export function hashSessionToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function createSessionToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashSessionToken(raw) };
}
```

- [ ] **Step 4: Run credential tests**

Run `npx vitest run src/domain/auth/credentials.test.ts`.

Expected: PASS.

Create `web/src/db/seed.ts` as an executable that migrates the configured database, refuses to run unless `PARENT_PASSWORD` and `CHILD_PIN` are set, hashes both values with `hashCredential`, and upserts exactly one parent and one child. Add `"db:seed": "tsx src/db/seed.ts"` to `package.json`. Do not store sample credentials in source control.

- [ ] **Step 5: Implement login and logout routes**

`POST /api/auth/login` accepts this Zod-validated body:

```ts
const loginInput = z.object({
  role: z.enum(["parent", "child"]),
  credential: z.string().min(4).max(128),
});
```

On success it deletes expired sessions, inserts a new session expiring in 7 days, and sets `math_session` with `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, and `secure: process.env.SESSION_COOKIE_SECURE === "true"`. Return `200` with `{ redirectTo: role === "parent" ? "/parent" : "/child" }`. Invalid credentials return the same `401` body `{ error: "身份或凭据不正确" }` for both roles.

`POST /api/auth/logout` deletes the matching hashed token, expires the cookie, and redirects to `/login`.

- [ ] **Step 6: Implement role guards**

Create `web/src/lib/auth/current-user.ts` with:

```ts
export type CurrentUser = { id: string; role: "parent" | "child"; displayName: string };

export async function getCurrentUser(): Promise<CurrentUser | null>;
export async function requireRole(role: CurrentUser["role"]): Promise<CurrentUser>;
```

`getCurrentUser` hashes the `math_session` cookie, joins a non-expired session to its user, and returns no credential data. `requireRole` redirects unauthenticated users to `/login` and authenticated users with the wrong role to their own home.

- [ ] **Step 7: Build the sign-in screen**

`/login` shows two large role cards. Selecting `child` changes the label to `PIN`; selecting `parent` changes it to `家长密码`. The client form posts JSON to `/api/auth/login`, shows the generic server error, then uses `window.location.assign(redirectTo)`.

Update `/` to call `getCurrentUser` and redirect authenticated users to their role home; unauthenticated users still see the landing page.

- [ ] **Step 8: Verify auth and commit**

Run:

```powershell
npm run verify
git add web/src/domain/auth web/src/lib/auth web/src/app/api/auth web/src/app/login web/src/app/page.tsx web/src/db/seed.ts
git commit -m "feat: add parent and child sign in"
```

Expected: credential tests, lint, typecheck, and build pass; browser JavaScript never receives hashes or raw session tokens other than the HttpOnly cookie set by the server.

---

### Task 4: Deterministic Question Contracts and Scoring

**Files:**
- Create: `web/src/domain/questions/answer-spec.ts`
- Create: `web/src/domain/questions/score-answer.ts`
- Create: `web/src/domain/questions/score-answer.test.ts`
- Create: `web/src/domain/training/types.ts`
- Modify: `web/src/db/seed.ts`

**Interfaces:**
- Consumes: question template `answerSpec` JSON
- Produces: `AnswerSpec`, `scoreAnswer(input: string, spec: AnswerSpec): ScoreResult`, and reviewed seed questions

- [ ] **Step 1: Write failing scorer tests**

Create `web/src/domain/questions/score-answer.test.ts`:

```ts
import { scoreAnswer } from "./score-answer";

test("accepts an equivalent decimal and required unit", () => {
  expect(scoreAnswer("7.50 元", { kind: "number", value: 7.5, tolerance: 0, unit: "元" }))
    .toEqual({ correct: true, normalizedAnswer: "7.5 元" });
});

test("rejects a missing required unit", () => {
  expect(scoreAnswer("7.5", { kind: "number", value: 7.5, tolerance: 0, unit: "元" }).correct)
    .toBe(false);
});

test("scores a choice without fuzzy matching", () => {
  expect(scoreAnswer("B", { kind: "choice", value: "B" }).correct).toBe(true);
  expect(scoreAnswer("b.", { kind: "choice", value: "B" }).correct).toBe(false);
});
```

- [ ] **Step 2: Run scorer tests to verify failure**

Run `npx vitest run src/domain/questions/score-answer.test.ts`.

Expected: FAIL because the scorer does not exist.

- [ ] **Step 3: Define and implement exact answer contracts**

Create `web/src/domain/questions/answer-spec.ts`:

```ts
import { z } from "zod";

export const answerSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), value: z.number(), tolerance: z.number().nonnegative(), unit: z.string().nullable() }),
  z.object({ kind: z.literal("choice"), value: z.enum(["A", "B", "C", "D"]) }),
]);

export type AnswerSpec = z.infer<typeof answerSpecSchema>;
```

Implement `scoreAnswer` with the exact signature:

```ts
export type ScoreResult = { correct: boolean; normalizedAnswer: string };
export function scoreAnswer(input: string, spec: AnswerSpec): ScoreResult;
```

For number answers, trim outer whitespace, require the exact configured unit when non-null, parse a finite decimal, and compare with `Math.abs(actual - value) <= tolerance`. For choice answers, accept only the exact trimmed uppercase letter. Never use AI or substring matching.

- [ ] **Step 4: Run scorer tests**

Run `npx vitest run src/domain/questions/score-answer.test.ts`.

Expected: all three tests pass.

- [ ] **Step 5: Seed one reviewed three-question session**

Update `web/src/db/seed.ts` to upsert these skills and templates after the family users:

```ts
const seedQuestions = [
  { id: "q-decimal-1", skillId: "skill-decimal", stem: "3.6 + 2.4 = ?", answerSpec: { kind: "number", value: 6, tolerance: 0, unit: null }, explanation: "把十分位对齐相加，结果是 6。", difficulty: 1 },
  { id: "q-equation-1", skillId: "skill-equation", stem: "3x + 5 = 26，x 等于多少？", answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null }, explanation: "先从等式两边都减去 5，再把两边都除以 3。", difficulty: 2 },
  { id: "q-reading-1", skillId: "skill-reading", stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。", answerSpec: { kind: "number", value: 7.5, tolerance: 0, unit: "元" }, explanation: "问题问付多少钱，因此答案必须带单位‘元’。", difficulty: 1 },
] as const;
```

Validate each `answerSpec` with `answerSpecSchema` before serializing it into the database.

- [ ] **Step 6: Verify and commit deterministic scoring**

Run:

```powershell
npm run test:run
npm run typecheck
git add web/src/domain/questions web/src/domain/training/types.ts web/src/db/seed.ts
git commit -m "feat: add reviewed questions and deterministic scoring"
```

---

### Task 5: Daily Session and Idempotent Attempt Service

**Files:**
- Create: `web/src/domain/training/mastery.ts`
- Create: `web/src/domain/training/mastery.test.ts`
- Create: `web/src/services/training/create-daily-session.ts`
- Create: `web/src/services/training/submit-attempt.ts`
- Create: `web/src/services/training/training-service.test.ts`
- Create: `web/src/app/api/child/attempts/route.ts`

**Interfaces:**
- Consumes: `AppDatabase`, `childId`, reviewed templates, `scoreAnswer`
- Produces: `getOrCreateDailySession(db, childId, date): SessionView` and `submitAttempt(db, command): AttemptResult`

- [ ] **Step 1: Write the failing mastery rule test**

Create `web/src/domain/training/mastery.test.ts`:

```ts
import { nextMasteryEvidence } from "./mastery";

test("requires repeated correct evidence before basic mastery", () => {
  expect(nextMasteryEvidence({ evidenceCount: 0, correctCount: 0 }, true))
    .toEqual({ evidenceCount: 1, correctCount: 1, status: "learning" });
  expect(nextMasteryEvidence({ evidenceCount: 1, correctCount: 1 }, true))
    .toEqual({ evidenceCount: 2, correctCount: 2, status: "basic" });
});

test("an incorrect answer keeps the skill in support", () => {
  expect(nextMasteryEvidence({ evidenceCount: 1, correctCount: 1 }, false).status)
    .toBe("needs_support");
});
```

- [ ] **Step 2: Verify the mastery test fails, then implement the pure rule**

Run `npx vitest run src/domain/training/mastery.test.ts` and expect a missing-module failure.

Create `web/src/domain/training/mastery.ts`:

```ts
type Evidence = { evidenceCount: number; correctCount: number };
type EvidenceResult = Evidence & { status: "needs_support" | "learning" | "basic" };

export function nextMasteryEvidence(current: Evidence, correct: boolean): EvidenceResult {
  const evidenceCount = current.evidenceCount + 1;
  const correctCount = current.correctCount + (correct ? 1 : 0);
  const status = !correct ? "needs_support" : correctCount >= 2 ? "basic" : "learning";
  return { evidenceCount, correctCount, status };
}
```

Run the test again and expect PASS.

- [ ] **Step 3: Implement daily-session creation**

Define this returned contract in `web/src/domain/training/types.ts`:

```ts
export type SessionQuestion = { id: string; position: number; stem: string; answered: boolean };
export type SessionView = { id: string; status: "in_progress" | "completed"; currentPosition: number; questions: SessionQuestion[] };
```

`getOrCreateDailySession` must:

1. Reuse the unique session for `childId + YYYY-MM-DD` when present.
2. Otherwise insert one `in_progress` session and the three active seed questions ordered by difficulty then ID.
3. Return stems but never return `answerSpec` or `explanation` before submission.
4. Mark each item as answered only when it has a correct attempt; an incorrect attempt remains available for correction.
5. Set `currentPosition` to the first unanswered item, or the question count when complete.

- [ ] **Step 4: Implement idempotent submission in one transaction**

Use this command and result:

```ts
export type SubmitAttemptCommand = {
  childId: string;
  sessionItemId: string;
  clientSubmissionId: string;
  answerText: string;
};

export type AttemptResult = {
  correct: boolean;
  normalizedAnswer: string;
  explanation: string;
  sessionCompleted: boolean;
};
```

`submitAttempt` must verify the item belongs to the child's active session, return the existing result for a repeated `clientSubmissionId`, score with `scoreAnswer`, insert the attempt, update the corresponding mastery row with `nextMasteryEvidence`, and mark the session complete only when every item has at least one correct attempt. A missing or foreign item throws `TrainingAccessError`; an answer over 128 characters throws `InvalidAnswerError`.

- [ ] **Step 5: Write service integration tests against temporary SQLite**

Create `web/src/services/training/training-service.test.ts` with an explicit migrated database and these tests:

```ts
import { eq } from "drizzle-orm";
import { attempts, masteryStates, questionTemplates, skills, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { getOrCreateDailySession } from "./create-daily-session";
import { submitAttempt } from "./submit-attempt";

function seedTrainingDatabase() {
  const db = createTestDatabase();
  db.insert(users).values({ id: "child-1", role: "child", displayName: "孩子", credentialHash: "hash", createdAt: 1 }).run();
  db.insert(skills).values([
    { id: "skill-decimal", code: "decimal", name: "小数计算", domain: "数与运算" },
    { id: "skill-equation", code: "equation", name: "一步方程", domain: "方程与代数意识" },
    { id: "skill-reading", code: "reading", name: "读题与单位", domain: "数学思维与学习习惯" },
  ]).run();
  db.insert(questionTemplates).values([
    { id: "q-decimal-1", skillId: "skill-decimal", stem: "3.6 + 2.4 = ?", answerSpec: JSON.stringify({ kind: "number", value: 6, tolerance: 0, unit: null }), explanation: "对齐十分位。", difficulty: 1, active: true },
    { id: "q-equation-1", skillId: "skill-equation", stem: "3x + 5 = 26，x 等于多少？", answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }), explanation: "先减 5，再除以 3。", difficulty: 2, active: true },
    { id: "q-reading-1", skillId: "skill-reading", stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？", answerSpec: JSON.stringify({ kind: "number", value: 7.5, tolerance: 0, unit: "元" }), explanation: "答案要带单位。", difficulty: 1, active: true },
  ]).run();
  return db;
}

test("creates one reusable session with three reviewed questions", () => {
  const db = seedTrainingDatabase();
  const first = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const second = getOrCreateDailySession(db, "child-1", "2026-08-19");
  expect(second.id).toBe(first.id);
  expect(first.questions).toHaveLength(3);
});

test("does not duplicate an attempt or evidence for the same client submission", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const command = { childId: "child-1", sessionItemId: session.questions[0].id, clientSubmissionId: "11111111-1111-4111-8111-111111111111", answerText: "6" };
  submitAttempt(db, command);
  submitAttempt(db, command);
  expect(db.select().from(attempts).all()).toHaveLength(1);
  expect(db.select().from(masteryStates).where(eq(masteryStates.childId, "child-1")).get()?.evidenceCount).toBe(1);
});

test("completes only after all three items have a correct answer", () => {
  const db = seedTrainingDatabase();
  const session = getOrCreateDailySession(db, "child-1", "2026-08-19");
  const answers = ["6", "7.5 元", "7"];
  let completed = false;
  session.questions.forEach((question, index) => {
    completed = submitAttempt(db, {
      childId: "child-1",
      sessionItemId: question.id,
      clientSubmissionId: `22222222-2222-4222-8222-22222222222${index}`,
      answerText: answers[index],
    }).sessionCompleted;
  });
  expect(completed).toBe(true);
});
```

- [ ] **Step 6: Expose the child submission route**

`POST /api/child/attempts` requires `requireRole("child")` and validates:

```ts
z.object({
  sessionItemId: z.string().min(1),
  clientSubmissionId: z.string().uuid(),
  answerText: z.string().max(128),
});
```

Return `200` with `AttemptResult`, `400` for invalid answer input, and `404` for an item not available to the signed-in child. Do not return a stack trace.

- [ ] **Step 7: Verify and commit the training service**

Run:

```powershell
npm run test:run
npm run typecheck
git add web/src/domain/training web/src/services/training web/src/app/api/child/attempts
git commit -m "feat: add deterministic daily training service"
```

Expected: pure mastery tests and SQLite integration tests pass.

---

### Task 6: Tablet Child Training Flow

**Files:**
- Create: `web/src/components/question-card.tsx`
- Create: `web/src/components/answer-form.tsx`
- Create: `web/src/components/session-progress.tsx`
- Create: `web/src/components/answer-form.test.tsx`
- Create: `web/src/app/child/page.tsx`
- Create: `web/src/app/child/session/[id]/page.tsx`
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Consumes: `requireRole("child")`, `getOrCreateDailySession`, and `POST /api/child/attempts`
- Produces: a complete tablet interaction from today entry through correction and completion

- [ ] **Step 1: Write the failing answer-form interaction test**

Create `web/src/components/answer-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerForm } from "./answer-form";

test("shows correction feedback returned by the server", async () => {
  const submit = vi.fn().mockResolvedValue({
    correct: false,
    normalizedAnswer: "6",
    explanation: "把十分位对齐后再相加。",
    sessionCompleted: false,
  });
  render(<AnswerForm sessionItemId="item-1" submitAnswer={submit} />);
  await userEvent.type(screen.getByLabelText("你的答案"), "5");
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));
  expect(await screen.findByText("再看一步")).toBeInTheDocument();
  expect(screen.getByText("把十分位对齐后再相加。")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component test to verify failure**

Run `npx vitest run src/components/answer-form.test.tsx`.

Expected: FAIL because `AnswerForm` does not exist.

- [ ] **Step 3: Implement the answer interaction**

`AnswerForm` accepts:

```ts
type AnswerFormProps = {
  sessionItemId: string;
  submitAnswer?: (payload: { sessionItemId: string; clientSubmissionId: string; answerText: string }) => Promise<AttemptResult>;
};
```

The default submitter posts to `/api/child/attempts`. Generate one `crypto.randomUUID()` when submission begins and reuse it if the same network request is retried. Disable input while submitting. On an incorrect result, show heading `再看一步`, the explanation, and an `修改答案` button. On a correct result, show `做对了，别忘了检查题目问的是什么。` and a `下一题` link or button.

- [ ] **Step 4: Build child routes**

`/child` requires the child role, calls `getOrCreateDailySession` with the current `Asia/Shanghai` calendar date, and displays one large `开始今天的训练` or `继续今天的训练` link.

`/child/session/[id]` verifies the requested session belongs to the child, renders only the first unanswered question, and shows `SessionProgress` as `第 N 题，共 3 题`. If all questions are answered, show a completion card with a link back to `/child`.

- [ ] **Step 5: Add tablet-safe styling**

Add CSS classes that ensure:

- Main training content is no wider than `960px` and centered.
- Body text is at least `18px` on viewports at or above `768px`.
- Inputs and buttons are at least `48px` high.
- Focus indicators have a visible `3px` outline.
- Feedback uses text and icons in addition to color.
- No timer is shown in Phase 1.

- [ ] **Step 6: Verify and commit the child flow**

Run:

```powershell
npm run verify
git add web/src/components web/src/app/child web/src/app/globals.css
git commit -m "feat: add tablet child training flow"
```

---

### Task 7: Parent Evidence Dashboard and Browser Acceptance

**Files:**
- Create: `web/src/services/training/get-parent-evidence.ts`
- Create: `web/src/services/training/get-parent-evidence.test.ts`
- Create: `web/src/app/parent/page.tsx`
- Create: `web/scripts/seed-e2e.ts`
- Create: `web/e2e/learning-loop.spec.ts`
- Create: `web/playwright.config.ts`
- Modify: `web/package.json`
- Modify: `web/.gitignore`

**Interfaces:**
- Consumes: attempts, question templates, skills, mastery states, role authentication
- Produces: `getParentEvidence(db, childId): ParentEvidence` and the Phase 1 end-to-end acceptance test

- [ ] **Step 1: Write the failing evidence query test**

Create `web/src/services/training/get-parent-evidence.test.ts`:

```ts
import { getParentEvidence } from "./get-parent-evidence";

test("summarizes attempts without hiding the supporting question", () => {
  const db = seededDatabaseWithOneCorrectAndOneIncorrectAttempt();
  const evidence = getParentEvidence(db, "child-1");
  expect(evidence.summary).toEqual({ answered: 2, correct: 1, accuracy: 0.5 });
  expect(evidence.recent[0]).toMatchObject({ stem: expect.any(String), answerText: expect.any(String), correct: expect.any(Boolean) });
});
```

Define `seededDatabaseWithOneCorrectAndOneIncorrectAttempt` in the same test file using `createTestDatabase` and explicit inserts; do not use an undeclared helper.

- [ ] **Step 2: Run the evidence test to verify failure**

Run `npx vitest run src/services/training/get-parent-evidence.test.ts`.

Expected: FAIL because the query does not exist.

- [ ] **Step 3: Implement parent evidence**

Use this exact contract:

```ts
export type ParentEvidence = {
  summary: { answered: number; correct: number; accuracy: number | null };
  recent: Array<{ stem: string; answerText: string; correct: boolean; submittedAt: number; skillName: string }>;
  skills: Array<{ skillName: string; status: "needs_support" | "learning" | "basic"; evidenceCount: number }>;
};
```

Return at most 20 recent attempts ordered newest first. Accuracy is `null` when no answers exist. Include the stem and skill name for every evidence row.

- [ ] **Step 4: Build the parent page**

`/parent` requires the parent role, selects the single child, calls `getParentEvidence`, and renders:

- 今日/累计 answered count and accuracy with the label `首次作答证据`.
- A three-state skill list.
- A recent evidence table containing question, submitted answer, result, and skill.
- A short recommendation: no evidence → `先让孩子完成今天的训练`; any incorrect answer → `本周先看错题原因，不额外加量`; otherwise → `保持当前训练节奏`.

The page must not describe Phase 1's minimal status as a final ability diagnosis.

- [ ] **Step 5: Add deterministic E2E seeding**

Create `web/scripts/seed-e2e.ts` to delete only the explicit file `.tmp/e2e.sqlite`, migrate it, then seed parent password `parent-test-1234`, child PIN `2468`, the three reviewed questions, and no attempts. Add `.tmp/` to `web/.gitignore`.

Add scripts:

```json
{
  "scripts": {
    "e2e:seed": "cross-env DB_FILE_NAME=.tmp/e2e.sqlite PARENT_PASSWORD=parent-test-1234 CHILD_PIN=2468 tsx scripts/seed-e2e.ts",
    "test:e2e": "playwright test"
  }
}
```

Install `cross-env` as a development dependency so the commands work in PowerShell and CI.

- [ ] **Step 6: Configure Playwright**

Create `web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  webServer: {
    command: "npm run e2e:seed && npm run dev",
    env: { DB_FILE_NAME: ".tmp/e2e.sqlite", SESSION_COOKIE_SECURE: "false" },
    port: 3000,
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "tablet", grep: /@tablet/, use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "parent-mobile", grep: /@parent/, dependencies: ["tablet"], use: { ...devices["iPhone 13"] } },
  ],
});
```

- [ ] **Step 7: Write the end-to-end learning loop**

Create `web/e2e/learning-loop.spec.ts` with two tests whose titles contain the project tags:

1. `@tablet child completes a corrected learning session`: choose child, enter `2468`, start the session, answer all three questions, intentionally answer `q-reading-1` without `元` first, verify correction feedback, correct it, and reach the completion card.
2. `@parent parent sees the supporting evidence`: choose parent, enter `parent-test-1234`, open the dashboard, verify the reading question and both the incorrect and corrected evidence are visible, and verify no horizontal page overflow with `document.documentElement.scrollWidth <= window.innerWidth`.

Use accessible roles and labels, not CSS selectors tied to layout.

- [ ] **Step 8: Run complete Phase 1 verification**

Run:

```powershell
npx playwright install chromium webkit
npm run verify
npm run test:e2e
git diff --check
```

Expected:

- Unit and integration tests pass.
- Production build passes.
- Tablet child flow passes in WebKit and Chromium-compatible emulation.
- Parent phone flow shows recorded evidence without horizontal overflow.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 9: Commit the completed vertical slice**

```powershell
git add web
git commit -m "feat: complete first family learning loop"
git status --short
```

Expected: commit succeeds and the worktree is clean except for any user-owned files that predated execution.

---

## Phase 1 Completion Gate

Do not start the Phase 2 plan until all of these are demonstrated:

- A child can sign in on a tablet viewport and complete the reviewed three-question session.
- Answers are scored deterministically and an omitted required unit is rejected.
- A repeated network submission cannot duplicate evidence.
- The session survives a page reload because progress is stored server-side.
- A parent can sign in on a phone viewport and inspect the exact question and submitted answer behind the summary.
- No AI key is required anywhere in the flow.
- `npm run verify` and `npm run test:e2e` pass from a clean install.

## Official Technical References

- Next.js App Router: https://nextjs.org/docs/app
- Drizzle Node SQLite: https://orm.drizzle.team/docs/sqlite/connect-node-sqlite
- Vitest guide: https://vitest.dev/guide/
- Playwright installation and browser testing: https://playwright.dev/docs/intro
