# Family Math Trainer Phase 2A Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Phase 2 data foundation, a validated 72-template catalog, and a deterministic three-part diagnosis that can pause, resume, version, and produce an initial report.

**Architecture:** Pure domain modules own Shanghai calendar calculations, catalog validation, seeded variants, and diagnosis difficulty movement. Server services own transactions and immutable snapshots; Next.js pages and route handlers only enforce roles, validate commands, and render service results. Existing Phase 1 daily training remains intact until Phase 2C replaces its scheduler.

**Tech Stack:** Node.js 24, Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5, SQLite, Drizzle ORM 1.0.0-rc.4, Zod 4.4.3, Vitest 3.2.7, Testing Library, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-20-family-math-trainer-phase-2-design.md`

## Global Constraints

- Apply every global constraint from `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2-roadmap.md`.
- Diagnosis has exactly three parts and 15 formal slots per part.
- Difficulty starts at 2, rises after two consecutive independent correct answers, falls after one incorrect answer, moves one level at a time, and remains within 1..4.
- A diagnosis run never repeats a template and uses a run-derived deterministic variant seed.
- Formal daily training unlocks only after all three parts complete; non-scoring practice remains available during diagnosis.
- A retest creates a new version and never overwrites a completed run or historical evidence.
- Phase 2A catalog size is exactly 72 active reviewed templates: 47 core, 18 regional, and 7 transition.

---

### Task 1: Shared learning contracts and Shanghai calendar

**Files:**
- Create: `web/src/domain/learning/contracts.ts`
- Create: `web/src/domain/time/shanghai-calendar.ts`
- Test: `web/src/domain/time/shanghai-calendar.test.ts`
- Modify: `web/src/app/child/page.tsx`
- Modify: `web/src/app/child/session/[id]/page.tsx`

**Interfaces:**
- Consumes: JavaScript `Date` or epoch milliseconds.
- Produces: `LearningDomain`, `ContentTier`, `SessionKind`, `MasteryStatus`, `ErrorCause`, `shanghaiDateKey`, `shanghaiWeekKey`, and `addShanghaiDays`.

- [ ] **Step 1: Write the calendar boundary test**

```ts
import { describe, expect, it } from "vitest";
import { addShanghaiDays, shanghaiDateKey, shanghaiWeekKey } from "./shanghai-calendar";

describe("Shanghai learning calendar", () => {
  it("uses Shanghai midnight and Monday week boundaries", () => {
    expect(shanghaiDateKey(new Date("2026-08-19T15:59:59Z"))).toBe("2026-08-19");
    expect(shanghaiDateKey(new Date("2026-08-19T16:00:00Z"))).toBe("2026-08-20");
    expect(shanghaiWeekKey(new Date("2026-08-23T15:59:59Z"))).toBe("2026-08-17");
    expect(shanghaiWeekKey(new Date("2026-08-23T16:00:00Z"))).toBe("2026-08-24");
    expect(addShanghaiDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
```

- [ ] **Step 2: Run the test and observe the missing module failure**

Run: `cd web; npx vitest run src/domain/time/shanghai-calendar.test.ts`

Expected: FAIL because `shanghai-calendar.ts` does not exist.

- [ ] **Step 3: Add the contracts and calendar implementation**

```ts
// contracts.ts
export const learningDomains = [
  "number_operations", "equation_algebra", "geometry_space",
  "data_statistics", "application_modeling", "thinking_habits",
] as const;
export type LearningDomain = typeof learningDomains[number];
export type ContentTier = "core" | "regional" | "transition";
export type SessionKind = "diagnostic" | "practice" | "daily" | "review" | "assessment";
export type MasteryStatus = "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
export type ErrorCause = "missing_unit" | "copied_number" | "calculation" | "relationship"
  | "range_check" | "incomplete_reading" | "unknown";
```

Implement calendar helpers with `Intl.DateTimeFormat(..., { timeZone: "Asia/Shanghai" })`; use UTC noon when converting a date key so daylight-saving behavior on the host cannot change results. Replace the two duplicated local `shanghaiDate` functions with `shanghaiDateKey`.

- [ ] **Step 4: Run focused and existing child tests**

Run: `cd web; npx vitest run src/domain/time/shanghai-calendar.test.ts src/services/training/training-service.test.ts`

Expected: both files pass.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/learning/contracts.ts web/src/domain/time web/src/app/child
git commit -m "feat: add Shanghai learning calendar contracts"
```

### Task 2: Phase 2A schema and populated migration

**Files:**
- Modify: `web/src/db/schema.ts`
- Modify: `web/src/db/schema.test.ts`
- Create: `web/drizzle/20260820090000_phase2a_diagnosis/migration.sql`
- Create: `web/drizzle/20260820090000_phase2a_diagnosis/snapshot.json`

**Interfaces:**
- Consumes: existing Phase 1 users, skills, templates, sessions, items, attempts, and mastery rows.
- Produces: diagnosis/version tables plus metadata and snapshot columns consumed by Tasks 3–6.

- [ ] **Step 1: Add a failing populated-migration test**

Extend `schema.test.ts` to migrate a fixture through all Phase 1 migrations, insert one completed session and attempt, apply the new migration, then assert:

```ts
expect(columns("question_templates")).toEqual(expect.arrayContaining([
  "domain", "content_tier", "structure_tag", "estimated_seconds",
  "reading_load", "answer_mode", "variant_spec", "hint_ladder",
]));
expect(columns("training_sessions")).toEqual(expect.arrayContaining([
  "kind", "rule_version", "target_seconds", "composition_snapshot",
]));
expect(columns("session_items")).toEqual(expect.arrayContaining([
  "difficulty_snapshot", "content_tier_snapshot", "structure_tag_snapshot",
  "variant_seed", "selection_reason_snapshot",
]));
expect(sqlite.prepare("select count(*) as count from attempts").get()).toEqual({ count: 1 });
expect(foreignKeyCheck(sqlite)).toEqual([]);
```

Also assert `diagnostic_runs` has a unique `(child_id, version)` index and `diagnostic_parts` has primary key `(run_id, part_number)`.

- [ ] **Step 2: Run the migration test and observe missing columns/tables**

Run: `cd web; npx vitest run src/db/schema.test.ts`

Expected: FAIL on the first missing Phase 2A column.

- [ ] **Step 3: Extend Drizzle schema with exact Phase 2A fields**

Add template metadata fields as non-null with safe legacy defaults, add session/item snapshot fields, and define:

```ts
export const diagnosticRuns = sqliteTable("diagnostic_runs", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["in_progress", "completed", "superseded"] }).notNull(),
  currentPart: integer("current_part").notNull().default(1),
  seed: text("seed").notNull(),
  reportSnapshot: text("report_snapshot"),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
}, (table) => [uniqueIndex("diagnostic_run_child_version_idx").on(table.childId, table.version)]);

export const diagnosticParts = sqliteTable("diagnostic_parts", {
  runId: text("run_id").notNull().references(() => diagnosticRuns.id, { onDelete: "cascade" }),
  partNumber: integer("part_number").notNull(),
  status: text("status", { enum: ["locked", "available", "in_progress", "completed"] }).notNull(),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
}, (table) => [primaryKey({ columns: [table.runId, table.partNumber] })]);
```

Add nullable `diagnosticRunId` and `diagnosticPartNumber` to `training_sessions`; preserve Phase 1 rows as `kind="daily"`, `rule_version="phase1"`, and `{}` composition.

- [ ] **Step 4: Generate, inspect, and verify the migration**

Run: `cd web; npm run db:generate`

Inspect the SQL to confirm it backfills every new non-null field before enforcing constraints and never disables foreign keys. Then run: `cd web; npx vitest run src/db/schema.test.ts`

Expected: all schema tests pass with the populated attempt retained and `foreign_key_check` empty.

- [ ] **Step 5: Commit**

```powershell
git add web/src/db/schema.ts web/src/db/schema.test.ts web/drizzle
git commit -m "feat: add diagnosis data foundation"
```

### Task 3: Catalog contracts, validation, and deterministic variants

**Files:**
- Create: `web/src/domain/questions/template-schema.ts`
- Create: `web/src/domain/questions/instantiate-template.ts`
- Create: `web/src/domain/questions/template-schema.test.ts`
- Create: `web/src/content/phase2-catalog.ts`
- Create: `web/src/content/phase2-catalog.test.ts`
- Modify: `web/src/db/seed.ts`
- Modify: `web/scripts/seed-e2e.ts`

**Interfaces:**
- Consumes: `LearningDomain`, `ContentTier`, the existing `answerSpecSchema`, and a string seed.
- Produces: `ReviewedTemplate`, `validateCatalog(catalog)`, and `instantiateTemplate(template, seed): QuestionInstance`.

- [ ] **Step 1: Write failing catalog and variant tests**

```ts
it("contains the approved 72-template distribution", () => {
  expect(phase2Catalog).toHaveLength(72);
  expect(countBy(phase2Catalog, "contentTier")).toEqual({ core: 47, regional: 18, transition: 7 });
  expect(countBy(phase2Catalog, "domain")).toEqual({
    number_operations: 16, equation_algebra: 18, geometry_space: 8,
    data_statistics: 6, application_modeling: 14, thinking_habits: 10,
  });
  expect(validateCatalog(phase2Catalog)).toEqual([]);
});

it("instantiates the same valid question for the same seed", () => {
  const template = phase2Catalog.find((item) => item.id === "eq-l4-two-step-01")!;
  expect(instantiateTemplate(template, "run-2:slot-7"))
    .toEqual(instantiateTemplate(template, "run-2:slot-7"));
  expect(() => answerSpecSchema.parse(instantiateTemplate(template, "run-2:slot-7").answerSpec))
    .not.toThrow();
});
```

- [ ] **Step 2: Run the tests and observe missing modules**

Run: `cd web; npx vitest run src/domain/questions/template-schema.test.ts src/content/phase2-catalog.test.ts`

Expected: FAIL because the catalog contracts do not exist.

- [ ] **Step 3: Implement strict schemas and seeded instantiation**

Define `ReviewedTemplate` with exact fields from design section 11. Use a local SHA-256-derived integer and a tiny deterministic index function; do not add a random-number dependency.

```ts
export type ReviewedTemplate = {
  id: string; skillCode: string; domain: LearningDomain; contentTier: ContentTier;
  difficulty: 1 | 2 | 3 | 4; structureTag: string; estimatedSeconds: number;
  readingLoad: "short" | "medium" | "long";
  answerMode: "mental" | "written" | "choice" | "fill" | "expression" | "equation";
  stemPattern: string; answerSpecPattern: unknown; explanationPattern: string;
  commonErrors: ErrorCause[]; hintLadder: [string, string, string];
  readingCard: boolean; source: "original"; licenseStatus: "owned";
  variantSpec: { variables: Record<string, readonly (string | number)[]> };
};
```

`validateCatalog` rejects duplicate IDs, empty variable ranges, answer specs rejected by `answerSpecSchema`, non-positive estimated seconds, unsupported placeholders, unsolvable equations, missing units, and any source/license pair other than `original/owned`.

- [ ] **Step 4: Encode the reviewed blueprint and seed it idempotently**

Use these exact ID groups and counts:

```text
number (16): num-int-mental-01..02, num-decimal-01..03, num-fraction-01..03,
num-mixed-01..02, num-law-01..02, num-estimate-01..02, num-reverse-check-01..02
equation (18): eq-l1-balance-01..03, eq-l2-add-sub-01..03, eq-l3-mul-div-01..03,
eq-l4-two-step-01..03, eq-l5-complex-01..03, eq-l6-model-01..03
geometry (8): geo-angle-01, geo-perimeter-01..02, geo-area-01..02,
geo-volume-01, geo-composite-01, geo-spatial-01
data (6): data-table-01, data-bar-01, data-line-01, data-average-01,
data-compare-01, data-possibility-01
application (14): app-price-01..02, app-distance-01..02, app-work-01..02,
app-ratio-01..02, app-percent-01..02, app-multi-step-01..02, app-extra-info-01..02
habits (10): habit-question-01..02, habit-condition-01..02, habit-unit-01..02,
habit-estimate-01..02, habit-check-01..02
```

Assign `transition` to exactly `eq-l6-model-03`, `geo-composite-01`, `app-multi-step-02`, `app-extra-info-02`, `habit-estimate-02`, `habit-check-01`, and `habit-check-02`. Assign `regional` to exactly `num-estimate-02`, `num-reverse-check-02`, `geo-spatial-01`, `data-table-01`, `data-bar-01`, `data-line-01`, `data-compare-01`, `app-price-02`, `app-distance-02`, `app-work-02`, `app-ratio-02`, `app-percent-02`, `app-multi-step-01`, `app-extra-info-01`, `habit-question-02`, `habit-condition-02`, `habit-unit-02`, and `habit-estimate-01`. Assign every other template `core`; this yields exactly 47/18/7. Regional templates emphasize multi-step reading, extra information, tables, patterns, and explanation. Each equation level must include direct solving, step judgment/completion, or modeling/checking across its three templates. Update both seed entry points to validate the entire catalog before opening the database, then upsert skills/templates.

Run: `cd web; npx vitest run src/domain/questions/template-schema.test.ts src/content/phase2-catalog.test.ts src/db/seed.test.ts`

Expected: all files pass; invalid catalog and credential fixtures create no database file.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/questions web/src/content web/src/db/seed.ts web/scripts/seed-e2e.ts web/src/db/seed.test.ts
git commit -m "feat: add reviewed phase 2 question catalog"
```

### Task 4: Pure diagnosis selection and initial report rules

**Files:**
- Create: `web/src/domain/diagnosis/types.ts`
- Create: `web/src/domain/diagnosis/select-next-question.ts`
- Create: `web/src/domain/diagnosis/derive-initial-report.ts`
- Create: `web/src/domain/diagnosis/diagnosis-rules.test.ts`

**Interfaces:**
- Consumes: catalog summaries, prior `DiagnosticAnswer[]`, run seed, and part number.
- Produces: `selectNextDiagnosticQuestion(input): DiagnosticSelection | null` and `deriveInitialReport(evidence): InitialDiagnosisReport`.

- [ ] **Step 1: Write failing rule tests**

Cover exact transitions:

```ts
expect(nextDifficulty([])).toBe(2);
expect(nextDifficulty([{ correct: true, independent: true, difficulty: 2 }])).toBe(2);
expect(nextDifficulty([
  { correct: true, independent: true, difficulty: 2 },
  { correct: true, independent: true, difficulty: 2 },
])).toBe(3);
expect(nextDifficulty([{ correct: false, independent: true, difficulty: 2 }])).toBe(1);
```

Also assert 15 selections contain 15 unique template IDs, the same run seed produces the same choices, different seeds can change variants but not eligible domain coverage, and weighted rates map `<50` to `needs_support`, `50..79` to `learning`, and `>=80` plus two templates to `basic`.

- [ ] **Step 2: Run and observe missing rule failures**

Run: `cd web; npx vitest run src/domain/diagnosis/diagnosis-rules.test.ts`

Expected: FAIL because the diagnosis modules do not exist.

- [ ] **Step 3: Implement pure deterministic rules**

```ts
export type DiagnosticAnswer = {
  templateId: string; skillId: string; domain: LearningDomain;
  difficulty: 1 | 2 | 3 | 4; correct: boolean; independent: boolean;
};

export type DiagnosticSelection = {
  templateId: string; variantSeed: string; difficulty: 1 | 2 | 3 | 4;
  reason: "part_anchor" | "raise_after_two" | "lower_after_error" | "hold_level";
};
```

Part domain rotations are fixed: part 1 rotates number skills, part 2 rotates equation/application/habit skills, part 3 rotates geometry/data/application/habit skills. Candidate sorting is `(difficulty distance, skill evidence count, template id)`; use the run seed only for the variant seed, never to bypass coverage or difficulty rules.

- [ ] **Step 4: Run the focused rules and catalog tests**

Run: `cd web; npx vitest run src/domain/diagnosis/diagnosis-rules.test.ts src/content/phase2-catalog.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/diagnosis
git commit -m "feat: add deterministic diagnosis rules"
```

### Task 5: Transactional diagnosis service and routes

**Files:**
- Create: `web/src/services/diagnosis/diagnosis-service.ts`
- Create: `web/src/services/diagnosis/diagnosis-service.test.ts`
- Create: `web/src/app/api/child/diagnosis/route.ts`
- Create: `web/src/app/api/child/diagnosis/route.test.ts`
- Modify: `web/src/services/training/submit-attempt.ts`

**Interfaces:**
- Consumes: authenticated child ID, database, run/part IDs, answer commands, and pure diagnosis rules.
- Produces: `getOrCreateDiagnosis`, `getDiagnosisView`, `submitDiagnosticAttempt`, `startDiagnosisRetest`.

- [ ] **Step 1: Write failing service tests**

Create a seeded test database and assert:

```ts
const first = getOrCreateDiagnosis(db, childId, now);
expect(first).toMatchObject({ version: 1, currentPart: 1, completedSlots: 0, totalSlots: 45 });

const retry = submitDiagnosticAttempt(db, command);
expect(submitDiagnosticAttempt(db, command)).toEqual(retry);
expect(countAttempts(db, command.clientSubmissionId)).toBe(1);

const resumed = getOrCreateDiagnosis(db, childId, now + 60_000);
expect(resumed.currentItem.id).toBe(firstNextItemId);
```

Complete 45 slots and assert one completed run, three completed parts, an initial report snapshot, and no formal daily session created before completion. Start a retest and assert version 2 while version 1 remains completed.

- [ ] **Step 2: Run and observe missing service failures**

Run: `cd web; npx vitest run src/services/diagnosis/diagnosis-service.test.ts`

Expected: FAIL because `diagnosis-service.ts` does not exist.

- [ ] **Step 3: Implement one-transaction state transitions**

```ts
export type DiagnosisView = {
  runId: string; version: number; status: "in_progress" | "completed";
  currentPart: 1 | 2 | 3; completedSlots: number; totalSlots: 45;
  currentItem: null | { id: string; position: number; stem: string; answerMode: string };
};
```

Use `behavior: "immediate"`. Create the next session item and all immutable snapshots before returning it. Bind each `clientSubmissionId` to child and item exactly as Phase 1 does. On slot 15 complete the part and unlock the next; on slot 45 complete the run and persist the report snapshot. Keep diagnosis result storage separate from the later 2B mastery tables so 2A remains independently deployable.

- [ ] **Step 4: Add child-only JSON routes and run focused tests**

`GET /api/child/diagnosis` returns the current view. `POST` accepts `{ sessionItemId, clientSubmissionId, answerText }` with the same 128-character limit and returns JSON `401/403/400/200` without redirects.

Run: `cd web; npx vitest run src/services/diagnosis/diagnosis-service.test.ts src/app/api/child/diagnosis/route.test.ts src/app/api/child/attempts/route.test.ts`

Expected: all tests pass, including role isolation and idempotency.

- [ ] **Step 5: Commit**

```powershell
git add web/src/services/diagnosis web/src/app/api/child/diagnosis web/src/services/training/submit-attempt.ts
git commit -m "feat: persist resumable diagnosis runs"
```

### Task 6: Diagnosis child/parent experience and browser acceptance

**Files:**
- Create: `web/src/app/child/diagnosis/page.tsx`
- Create: `web/src/app/child/diagnosis/[runId]/page.tsx`
- Create: `web/src/components/diagnosis-progress.tsx`
- Create: `web/src/components/diagnosis-answer-form.tsx`
- Create: `web/src/components/diagnosis-answer-form.test.tsx`
- Modify: `web/src/app/child/page.tsx`
- Modify: `web/src/app/parent/page.tsx`
- Modify: `web/src/app/parent/page.test.tsx`
- Modify: `web/src/app/globals.css`
- Create: `web/e2e/diagnosis.spec.ts`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: `DiagnosisView`, initial report snapshot, existing child/parent role guards.
- Produces: resumable diagnosis UI, parent progress/report summary, and Phase 2A acceptance test.

- [ ] **Step 1: Write failing component and page tests**

```tsx
render(<DiagnosisProgress part={2} completedInPart={7} totalInPart={15} />);
expect(screen.getByText("第 2 部分，共 3 部分")).toBeVisible();
expect(screen.getByText("本部分 7 / 15")).toBeVisible();
```

Parent page test must render “诊断进行中 · 22/45” before completion and the six-domain initial status summary after completion. Child home must link to “继续初始诊断” while incomplete and must not call formal adaptive daily scheduling.

- [ ] **Step 2: Run the component/page tests and observe missing UI failures**

Run: `cd web; npx vitest run src/components/diagnosis-answer-form.test.tsx src/app/parent/page.test.tsx src/app/page.test.tsx`

Expected: FAIL on missing diagnosis components/copy.

- [ ] **Step 3: Implement the tablet-first diagnosis UI**

Use the existing question card and feedback language. Do not show a timer or rank. The form disables duplicate clicks but reuses the same submission ID only for uncertain network/malformed success retries; editable validation/auth failures receive a new ID. After each slot navigate back to the same run URL and render the next persisted item.

Parent report shows difficulty path and state labels as provisional diagnosis results, not final ability claims. Add responsive styles with 44px minimum targets and no horizontal overflow at 390px and iPad widths.

- [ ] **Step 4: Add deterministic E2E seed and run all Phase 2A gates**

The browser test must:

1. log in as child;
2. answer at least two independent correct items and one incorrect item;
3. reload mid-part and assert the same next item returns;
4. finish all three parts using deterministic seeded answers;
5. log in as parent and assert version 1, 45/45, and the initial report;
6. run at tablet WebKit and stable Chrome widths without horizontal overflow.

Run:

```powershell
cd web
npm run verify
npm run test:e2e
git diff --check
```

Expected: all commands exit `0`; the unchanged Phase 1 learning loop and new diagnosis flow pass in both configured browser engines.

- [ ] **Step 5: Commit**

```powershell
git add web/src/app/child web/src/app/parent web/src/components web/src/app/globals.css web/e2e web/README.md
git commit -m "feat: deliver phase 2 diagnosis experience"
```

## Phase 2A Completion Gate

- [ ] A populated Phase 1 database migrates with all historical rows and constraints intact.
- [ ] Catalog validation proves exactly 72 templates with the approved domain/tier distribution.
- [ ] Three 15-slot diagnosis parts follow the exact deterministic difficulty rules.
- [ ] Pause, reload, retry, resume, completion, and retest versioning are covered.
- [ ] Parent sees progress and a versioned initial report; no page describes it as a stable long-term conclusion.
- [ ] `npm run verify`, WebKit, stable Chrome, and `git diff --check` pass.
