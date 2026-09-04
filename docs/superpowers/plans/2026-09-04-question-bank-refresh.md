# Adaptive Question Bank Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materialize validated question variants into a visible, editable bank, replenish it weekly, and select due-review questions from that bank at the child's current ability level.

**Architecture:** Reuse the existing reviewed `phase2Catalog`, deterministic instantiator, formal validators, scheduler, and immutable `session_items` snapshots. Add persistent question instances plus one weekly refresh ledger; the training service replenishes inventory before selection and degrades to existing stock if refresh fails. A parent-only page reads and edits bank instances through one service and one PATCH route.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite, Drizzle ORM, Zod, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-question-bank-refresh-design.md`

## Global Constraints

- Work in `E:/Wayne/Doc/FuTest/.worktrees/math-trainer-phase-2` on `feature/math-trainer-phase-2`.
- Do not add a dependency or call an AI provider; generate only from the existing reviewed catalog.
- Generated questions become active only after existing formal answer, unit, unique-choice, and duplicate checks pass.
- Run at most one completed full refresh per Shanghai Monday week; a scoped shortage refresh may run while creating a session.
- Maintain at least 8 recently unused instances per skill and difficulty when the reviewed catalog can supply them, replenish toward 12, and insert at most 40 per run.
- Parent changes never mutate existing `session_items` snapshots or historical evidence.
- Do not add delete behavior; inactive rows preserve provenance.
- Read the relevant local Next.js 16 guides under `web/node_modules/next/dist/docs/` before changing App Router pages or route handlers.

---

### Task 1: Persist question instances and refresh runs

**Files:**
- Modify: `web/src/db/schema.ts`
- Modify: `web/src/db/schema.test.ts`
- Create: `web/drizzle/20260904120000_question_bank_inventory/migration.sql`
- Create: `web/drizzle/20260904120000_question_bank_inventory/snapshot.json`

**Interfaces:**
- Produces: `questionInstances`, `questionBankRefreshes`, and nullable `sessionItems.questionInstanceId`.
- `questionInstances.fingerprint` is immutable provenance; parent edits update visible fields but not this fingerprint.

- [ ] **Step 1: Write the failing schema test**

Add a test that migrates a fresh database, inserts one template and one instance, rejects a duplicate fingerprint, records a weekly refresh, and accepts a legacy session item with `questionInstanceId: null`.

```ts
db.insert(questionInstances).values({
  id: "instance-1",
  templateId: "template-1",
  skillId: "skill-1",
  variantSeed: "2026-09-04:template-1:0",
  variables: JSON.stringify({ left: 3, right: 4, answer: 7 }),
  stem: "3 + 4 = ?",
  answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }),
  explanation: "3 加 4 等于 7。",
  difficulty: 1,
  fingerprint: "fingerprint-1",
  active: true,
  generatedAt: 1,
  updatedAt: 1,
}).run();
expect(() => db.insert(questionInstances).values({
  id: "instance-2",
  templateId: "template-1",
  skillId: "skill-1",
  variantSeed: "duplicate-seed",
  variables: "{}",
  stem: "3 + 4 = ?",
  answerSpec: JSON.stringify({ kind: "number", value: 7, tolerance: 0, unit: null }),
  explanation: "重复题",
  difficulty: 1,
  fingerprint: "fingerprint-1",
  active: true,
  generatedAt: 2,
  updatedAt: 2,
}).run())
  .toThrow();
```

- [ ] **Step 2: Run the test and confirm the tables are missing**

Run: `cd web; npm run test:run -- src/db/schema.test.ts`

Expected: FAIL because `questionInstances` and `questionBankRefreshes` are not exported.

- [ ] **Step 3: Add the minimal schema and migration**

Define the tables without duplicating metadata already available from the source template:

```ts
export const questionInstances = sqliteTable("question_instances", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull().references(() => questionTemplates.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  variantSeed: text("variant_seed").notNull(),
  variables: text("variables").notNull(),
  stem: text("stem").notNull(),
  answerSpec: text("answer_spec").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: integer("difficulty").notNull(),
  fingerprint: text("fingerprint").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  generatedAt: integer("generated_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastUsedAt: integer("last_used_at"),
}, (table) => [
  uniqueIndex("question_instances_fingerprint_idx").on(table.fingerprint),
  check("question_instances_difficulty", sql`${table.difficulty} BETWEEN 1 AND 4`),
]);

export const questionBankRefreshes = sqliteTable("question_bank_refreshes", {
  weekKey: text("week_key").primaryKey(),
  completedAt: integer("completed_at").notNull(),
  generatedCount: integer("generated_count").notNull(),
  errors: text("errors").notNull().default("[]"),
});
```

Add `questionInstanceId` as a nullable foreign key on `sessionItems`. Write the SQL migration and generate its snapshot with the project's existing Drizzle tooling so later schema generation remains consistent.

- [ ] **Step 4: Verify schema and migration compatibility**

Run: `cd web; npm run test:run -- src/db/schema.test.ts src/db/seed.test.ts`

Expected: PASS, including migration of the existing Phase 2 fixture.

- [ ] **Step 5: Commit the isolated database change**

```bash
git add web/src/db/schema.ts web/src/db/schema.test.ts web/drizzle/20260904120000_question_bank_inventory
git commit -m "feat: persist generated question bank"
```

---

### Task 2: Replenish the bank from reviewed variants

**Files:**
- Create: `web/src/services/questions/question-bank-refresh.ts`
- Create: `web/src/services/questions/question-bank-refresh.test.ts`
- Modify: `web/src/domain/questions/instantiate-template.ts`
- Modify: `web/src/domain/questions/template-schema.test.ts`

**Interfaces:**
- Produces: `ensureQuestionBankFresh(db, date, options?) => QuestionBankRefreshResult`.
- `options` is `{ skillIds?: readonly string[]; force?: boolean; now?: number }`.
- `QuestionBankRefreshResult` is `{ skipped: boolean; generated: number; errors: string[] }`.
- Produces: `questionFingerprint(instance) => string`, using SHA-256 over template ID, rendered stem, and serialized answer specification.

- [ ] **Step 1: Write failing replenishment tests**

Cover four behaviors in one test file:

```ts
expect(ensureQuestionBankFresh(db, "2026-09-04", { now: 1 })).toMatchObject({
  skipped: false,
  generated: expect.any(Number),
});
expect(db.select().from(questionInstances).where(eq(questionInstances.active, true)).all().length)
  .toBeGreaterThan(0);
expect(ensureQuestionBankFresh(db, "2026-09-05", { now: 2 }))
  .toEqual({ skipped: true, generated: 0, errors: [] });
expect(new Set(db.select().from(questionInstances).all().map((row) => row.fingerprint)).size)
  .toBe(db.select().from(questionInstances).all().length);
```

Also assert that `skillIds` limits a shortage refresh, invalid rendered variants are recorded and skipped, and no invocation inserts more than 40 rows.

- [ ] **Step 2: Run the tests and confirm the service is absent**

Run: `cd web; npm run test:run -- src/services/questions/question-bank-refresh.test.ts`

Expected: FAIL because `ensureQuestionBankFresh` does not exist.

- [ ] **Step 3: Implement idempotent materialization**

Reuse `phase2Catalog`, `instantiateTemplateAtIndex`, `variantPeriod`, `validateCatalog`, `renderedQuestionErrors`, and `shanghaiWeekKey`. Iterate stable template and variant-index order; compute current active inventory from instances not used in the previous 30 Shanghai dates. For cells below 8, insert unseen valid variants until 12 or until the reviewed variants are exhausted. Use `onConflictDoNothing()` on the fingerprint and stop after 40 successful inserts.

```ts
export function questionFingerprint(instance: QuestionInstance) {
  return createHash("sha256")
    .update(JSON.stringify([instance.templateId, instance.stem, instance.answerSpec]))
    .digest("hex");
}
```

Run the read/check/insert/refresh-ledger write in an immediate transaction. A full refresh returns `skipped: true` when `questionBankRefreshes.weekKey === shanghaiWeekKey(date)`. Scoped shortage refreshes ignore the weekly ledger but remain idempotent through the fingerprint constraint. Catch errors per variant, store their stable error codes in the ledger, and do not insert invalid rows.

- [ ] **Step 4: Run focused catalog and refresh tests**

Run: `cd web; npm run test:run -- src/domain/questions/template-schema.test.ts src/services/questions/question-bank-refresh.test.ts`

Expected: PASS; the existing reviewed catalog remains valid.

- [ ] **Step 5: Commit the refresh service**

```bash
git add web/src/domain/questions/instantiate-template.ts web/src/domain/questions/template-schema.test.ts web/src/services/questions
git commit -m "feat: replenish reviewed question variants"
```

---

### Task 3: Schedule persistent instances for due reviews

**Files:**
- Modify: `web/src/domain/scheduling/select-daily-items.ts`
- Modify: `web/src/domain/scheduling/daily-scheduler.test.ts`
- Modify: `web/src/services/training/create-adaptive-session.ts`
- Modify: `web/src/services/training/create-adaptive-session.test.ts`

**Interfaces:**
- `ScheduledCandidate` adds `questionInstanceId: string` and `lastUsedAt: number | null` while retaining `templateId` for evidence provenance.
- `ScheduledItem` carries the selected `questionInstanceId` into session creation.
- Consumes: `ensureQuestionBankFresh` from Task 2 and `questionInstances` from Task 1.

- [ ] **Step 1: Write failing scheduler and service tests**

Add scheduler candidates with two instances from the same template. Assert that the older/never-used instance wins, instance IDs do not repeat, overdue review still wins, and the existing two-review-items-per-skill cap remains.

Add an integration test that creates a due review with no bank rows, calls `getOrCreateAdaptiveSession`, and asserts:

```ts
expect(session.questions).toContainEqual(expect.objectContaining({
  stem: expect.stringContaining("方程"),
}));
const item = db.select().from(sessionItems).where(eq(sessionItems.sessionId, session.id)).get();
expect(item?.questionInstanceId).not.toBeNull();
expect(db.select().from(questionInstances).where(eq(questionInstances.id, item!.questionInstanceId!)).get()?.lastUsedAt)
  .not.toBeNull();
```

Also force refresh failure and assert session creation falls back to existing active instances.

- [ ] **Step 2: Run focused tests and confirm instance selection is unsupported**

Run: `cd web; npm run test:run -- src/domain/scheduling/daily-scheduler.test.ts src/services/training/create-adaptive-session.test.ts`

Expected: FAIL on missing `questionInstanceId` and no replenishment call.

- [ ] **Step 3: Replace session-time template instantiation with bank selection**

Before the session transaction, call the full weekly refresh in a `try/catch`; refresh failure must not prevent use of existing inventory. Inside the transaction, derive target skill IDs from due reviews and the active plan. If any target skill has no active instance, call one scoped refresh before re-entering the session transaction.

Build candidates from `questionInstances` joined to `questionTemplates` and `skills`. Sort equal-priority candidates by `lastUsedAt` ascending with `null` first, then instance ID. Change the scheduler's duplicate set from template ID to instance ID. Preserve overdue ordering, mastery/difficulty distance, composition, time budget, structure cap, and review cap.

Create `sessionItems` directly from the selected instance fields and source-template metadata:

```ts
{
  questionInstanceId: instance.id,
  questionTemplateId: instance.templateId,
  stemSnapshot: instance.stem,
  answerSpecSnapshot: instance.answerSpec,
  explanationSnapshot: instance.explanation,
  difficultySnapshot: instance.difficulty,
}
```

Update all selected rows' `lastUsedAt` in the same immediate transaction. Existing daily sessions and diagnostic sessions continue to load unchanged.

- [ ] **Step 4: Verify adaptive scheduling and legacy learning flow**

Run: `cd web; npm run test:run -- src/domain/scheduling/daily-scheduler.test.ts src/services/training/create-adaptive-session.test.ts src/services/training/training-service.test.ts src/services/training/update-learning-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit bank-backed scheduling**

```bash
git add web/src/domain/scheduling web/src/services/training/create-adaptive-session.ts web/src/services/training/create-adaptive-session.test.ts
git commit -m "feat: schedule due reviews from question bank"
```

---

### Task 4: Add parent question-bank read and edit operations

**Files:**
- Create: `web/src/services/parent/question-bank.ts`
- Create: `web/src/services/parent/question-bank.test.ts`
- Create: `web/src/app/api/parent/questions/[id]/route.ts`
- Create: `web/src/app/api/parent/questions/[id]/route.test.ts`

**Interfaces:**
- Produces: `listQuestionBank(db, filters) => QuestionBankRow[]`.
- `filters` is `{ skillId?: string; domain?: LearningDomain; difficulty?: 1 | 2 | 3 | 4; status?: "active" | "inactive" }`.
- Produces: `updateQuestionBankItem(db, id, input, now) => QuestionBankRow`.
- `PATCH /api/parent/questions/:id` accepts `{ stem, answerSpec, explanation, skillId, difficulty, active }`.

- [ ] **Step 1: Write failing service and route tests**

Service tests must assert filters, deterministic ordering, successful edit, no physical deletion, and unchanged historical snapshot after editing an instance already referenced by a session item.

Route tests must assert 401 for anonymous users, 403 for a child, 404 for a missing instance, and 400 for invalid input. Include a mathematically wrong answer:

```ts
const response = await PATCH(parentRequest({
  stem: "3 + 4 = ?",
  answerSpec: { kind: "number", value: 8, tolerance: 0, unit: null },
  explanation: "错误答案",
  skillId: "skill-integer-mental",
  difficulty: 1,
  active: true,
}), { params: Promise.resolve({ id: "instance-1" }) });
expect(response.status).toBe(400);
```

- [ ] **Step 2: Run tests and confirm the parent API is absent**

Run: `cd web; npm run test:run -- src/services/parent/question-bank.test.ts src/app/api/parent/questions/[id]/route.test.ts`

Expected: FAIL because the service and route do not exist.

- [ ] **Step 3: Implement read, validation, and update**

Join the instance to its template and skill so the view includes template name/ID, domain, structure, generation date, last-used date, and status. Limit one page to 100 rows and order active first, then skill code, difficulty, and stem.

Use a strict Zod request schema with trimmed non-empty strings, the existing `answerSpecSchema`, a known skill ID, and difficulty 1–4. Validate the edited stem and answer with `renderedQuestionErrors({ answerMode: template.answerMode, stem, answerSpec })`; reject any returned error. Serialize the parsed answer and update `updatedAt`, but never update `fingerprint`, `generatedAt`, or history snapshots.

Use the existing parent-route authentication and `{ error: { code, message } }` response shape.

- [ ] **Step 4: Verify parent service and API behavior**

Run: `cd web; npm run test:run -- src/services/parent/question-bank.test.ts src/app/api/parent/questions/[id]/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the parent operations**

```bash
git add web/src/services/parent/question-bank.ts web/src/services/parent/question-bank.test.ts web/src/app/api/parent/questions
git commit -m "feat: let parents manage question bank items"
```

---

### Task 5: Build the parent question-bank page

**Files:**
- Create: `web/src/app/parent/questions/page.tsx`
- Create: `web/src/app/parent/questions/page.test.tsx`
- Create: `web/src/components/question-bank-editor.tsx`
- Create: `web/src/components/question-bank-editor.test.tsx`
- Modify: `web/src/app/parent/page.tsx`
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Consumes: `listQuestionBank` and `QuestionBankRow` from Task 4.
- The editor PATCHes one item and reloads only after a successful response.

- [ ] **Step 1: Write failing page and editor tests**

Assert that `/parent/questions` requires the parent role, exposes filters for knowledge point, domain, difficulty, and status, displays answer/analysis/provenance timestamps, and renders at most 100 rows.

Editor tests must change the stem, correct answer, optional unit, and difficulty; save the complete row payload; display a field-level server error; and toggle active/inactive without a delete control.

- [ ] **Step 2: Run tests and confirm the UI is absent**

Run: `cd web; npm run test:run -- src/app/parent/questions/page.test.tsx src/components/question-bank-editor.test.tsx`

Expected: FAIL because the page and editor do not exist.

- [ ] **Step 3: Implement the smallest accessible management UI**

Add a visible “查看题库” link near the parent page heading. The question-bank page calls `ensureQuestionBankFresh` in a `try/catch`, then lists existing rows even if refresh fails. It uses native GET query parameters and `<select>` controls for filters; no client-side table framework. Render each row as a `<details>` block so mobile layouts do not require horizontal scrolling. Inside it, `QuestionBankEditor` provides labeled inputs for题干、正确答案、可选单位、解析、知识点、难度和启用状态; it constructs the existing number or choice `answerSpec` internally instead of exposing JSON to the parent.

Reuse existing button, form, error, spacing, and color styles. Keep controls at least 44px high, retain visible focus states, use `role="alert"` for save errors, and show “已保存” after success.

- [ ] **Step 4: Verify UI, types, and lint**

Run: `cd web; npm run test:run -- src/app/parent/questions/page.test.tsx src/components/question-bank-editor.test.tsx src/app/parent/page.test.tsx`

Run: `cd web; npm run typecheck`

Run: `cd web; npm run lint`

Expected: all commands PASS.

- [ ] **Step 5: Commit the parent page**

```bash
git add web/src/app/parent web/src/components/question-bank-editor.tsx web/src/components/question-bank-editor.test.tsx web/src/app/globals.css
git commit -m "feat: add parent question bank page"
```

---

### Task 6: Prove the complete review-to-history flow

**Files:**
- Modify: `web/e2e/learning-loop.spec.ts`
- Modify: `web/scripts/seed-e2e.ts`

**Interfaces:**
- Consumes all previous tasks; produces no reusable runtime interface.

- [ ] **Step 1: Add one failing end-to-end scenario**

Seed a completed diagnosis, an overdue equation review, and an empty equation instance inventory. The scenario must:

1. open the child daily session;
2. verify the first review item is an equation question rather than a knowledge-point label;
3. answer it;
4. open the parent question bank and edit that bank row;
5. reopen the completed session evidence and verify the original stem remains unchanged;
6. verify no horizontal overflow at the existing mobile and tablet project widths.

- [ ] **Step 2: Run the scenario and confirm the missing bank flow**

Run: `cd web; npx playwright test e2e/learning-loop.spec.ts --project=phase2-chromium`

Expected: FAIL before the new bank page and instance-backed scheduler are wired end to end.

- [ ] **Step 3: Make only fixture corrections required by the scenario**

Update `seed-e2e.ts` to leave the target question-instance cell empty while retaining the overdue review. Do not add production-only shortcuts or test flags.

- [ ] **Step 4: Run the full verification set**

Run: `cd web; npm run verify`

Run: `cd web; npm run test:e2e:chromium`

Expected: all commands PASS and the end-to-end scenario proves automatic generation, direct activation, adaptive review selection, parent editing, and immutable history.

- [ ] **Step 5: Commit the end-to-end proof**

```bash
git add web/e2e/learning-loop.spec.ts web/scripts/seed-e2e.ts
git commit -m "test: cover automatic question bank refresh"
```
