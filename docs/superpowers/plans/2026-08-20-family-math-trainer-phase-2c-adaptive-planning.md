# Family Math Trainer Phase 2C Adaptive Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate versioned six-week plans and deterministic adaptive daily sessions, then deliver the complete four-part child experience and parent planning/weekly-report experience.

**Architecture:** A pure six-week planner converts diagnosis, mastery, review, dosage, and parent preferences into versioned weekly targets. A pure daily scheduler selects validated question instances into an immutable session snapshot using due-review priority, 45/25/20/10 targets, expected-time budget, and shortage fallback. Child and parent UIs consume application services and never calculate derived learning state in the browser.

**Tech Stack:** Node.js 24, Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5, SQLite, Drizzle ORM 1.0.0-rc.4, Zod 4.4.3, Vitest 3.2.7, Testing Library, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-20-family-math-trainer-phase-2-design.md`

## Global Constraints

- Complete and review Phase 2A and 2B before starting this plan.
- Apply every global constraint from `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2-roadmap.md`.
- The default week has five training days: four regular days and one mixed assessment/correction day.
- A stage assessment occurs in week 4; a new six-week plan version is generated after week 6.
- Daily target composition is 45% current weakness, 25% spaced review, 20% reading/application, and 10% interest/extension.
- Parent specialist focus adds 15 percentage points to its category without removing due review or breaking item/session/week caps.
- A daily session stores plan version, rule version, composition, question snapshots, selection reasons, variant seeds, and expected duration before it is shown.
- A category shortage reallocates to due review, current weakness, and reading/application in that order, then shortens the session.
- Same-structure items remain capped at six; one skill receives at most two due-review items per day.
- Formal adaptive daily training is unavailable before diagnosis completion.

---

### Task 1: Versioned plan/preferences schema and migration

**Files:**
- Modify: `web/src/db/schema.ts`
- Modify: `web/src/db/schema.test.ts`
- Create: `web/drizzle/20260820110000_phase2c_planning/migration.sql`
- Create: `web/drizzle/20260820110000_phase2c_planning/snapshot.json`

**Interfaces:**
- Consumes: completed diagnosis, mastery, review, dosage, and existing session snapshots.
- Produces: `learning_plans`, `plan_targets`, `parent_preferences`, and session plan linkage.

- [ ] **Step 1: Add a failing populated migration test**

After migrating a database with Phase 1 history plus completed 2A/2B state, assert:

```ts
expect(primaryKeyColumns("learning_plans")).toEqual(["id"]);
expect(uniqueIndexColumns("learning_plan_child_version_idx")).toEqual(["child_id", "version"]);
expect(primaryKeyColumns("plan_targets")).toEqual(["plan_id", "week_number", "target_key"]);
expect(primaryKeyColumns("parent_preferences")).toEqual(["child_id"]);
expect(columns("training_sessions")).toContain("learning_plan_id");
expect(foreignKeyCheck(sqlite)).toEqual([]);
expect(count("attempts")).toBe(existingAttemptCount);
```

- [ ] **Step 2: Run and observe missing tables**

Run: `cd web; npx vitest run src/db/schema.test.ts`

Expected: FAIL on missing Phase 2C tables.

- [ ] **Step 3: Add exact Drizzle tables**

```ts
export const learningPlans = sqliteTable("learning_plans", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  diagnosisRunId: text("diagnosis_run_id").notNull().references(() => diagnosticRuns.id),
  version: integer("version").notNull(),
  revision: integer("revision").notNull().default(1),
  status: text("status", { enum: ["active", "completed", "superseded"] }).notNull(),
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  reasonSnapshot: text("reason_snapshot").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("learning_plan_child_version_idx").on(table.childId, table.version, table.revision)]);

export const parentPreferences = sqliteTable("parent_preferences", {
  childId: text("child_id").primaryKey().references(() => users.id),
  trainingWeekdays: text("training_weekdays").notNull(), // JSON [1,2,3,4,6]
  targetMinutes: integer("target_minutes").notNull().default(30),
  specialistFocus: text("specialist_focus", { enum: ["none", "computation", "equation", "reading"] }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

`plan_targets` stores week 1..6, target key, skill/track, min/target/max, category, and reason code. Add nullable `learningPlanId`, non-null `planRevision`, and non-null `compositionSnapshot` to sessions with safe Phase 1 defaults; extend session status with `completed_early`. Add nullable `readingCardResponse` JSON to attempts.

- [ ] **Step 4: Generate and verify migration**

Run: `cd web; npm run db:generate`

Inspect data-copy order and constraints; then run `cd web; npx vitest run src/db/schema.test.ts`.

Expected: populated migration passes with old attempts and snapshots unchanged.

- [ ] **Step 5: Commit**

```powershell
git add web/src/db/schema.ts web/src/db/schema.test.ts web/drizzle
git commit -m "feat: add versioned learning plan schema"
```

### Task 2: Pure six-week planner and plan service

**Files:**
- Create: `web/src/domain/planning/build-six-week-plan.ts`
- Create: `web/src/domain/planning/build-six-week-plan.test.ts`
- Create: `web/src/services/planning/learning-plan-service.ts`
- Create: `web/src/services/planning/learning-plan-service.test.ts`

**Interfaces:**
- Consumes: completed diagnosis ID/report, mastery map, dosage states, due reviews, Shanghai start date, and parent preferences.
- Produces: `buildSixWeekPlan(input): SixWeekPlanDraft`, `createInitialPlan`, `reviseActivePlan`, and `rollPlanAfterWeekSix`.

- [ ] **Step 1: Write failing planner tests**

```ts
const draft = buildSixWeekPlan(fixtureInput({ startsOn: "2026-08-24" }));
expect(draft.endsOn).toBe("2026-10-04");
expect(draft.weeks).toHaveLength(6);
expect(draft.weeks[3].assessment).toBe(true);
expect(draft.weeks[5].replanAfter).toBe(true);
expect(draft.weeks.every((week) => week.trainingDays === 5)).toBe(true);
expect(draft.weeks[0].targets.find((target) => target.key === "equation"))
  .toMatchObject({ minimum: 15, target: 18, maximum: 20 });
```

Add tests that the weakest diagnosed skills receive priority, due reviews retain minimum exposure, a reading specialist focus increases its category by 15 points, and plan output is identical for identical input.

- [ ] **Step 2: Run and observe missing planner failure**

Run: `cd web; npx vitest run src/domain/planning/build-six-week-plan.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement explicit plan types and deterministic ordering**

```ts
export type PlanCategory = "weakness" | "review" | "reading" | "extension";
export type WeeklyTarget = {
  key: string; skillId: string | null; track: "computation" | "equation" | null;
  category: PlanCategory; minimum: number; target: number; maximum: number;
  reasonCode: string;
};
export type PlanWeek = { week: 1 | 2 | 3 | 4 | 5 | 6; trainingDays: 5; assessment: boolean;
  replanAfter: boolean; targets: WeeklyTarget[] };
export type SixWeekPlanDraft = { startsOn: string; endsOn: string; weeks: PlanWeek[]; reasonSnapshot: string };
```

Sort weak skills by mastery rank, due date, evidence count, then skill ID. Use approved dosage targets and always create review minimums. Do not create daily items here.

- [ ] **Step 4: Persist version/revision transactionally**

`createInitialPlan` requires a completed diagnosis and no active plan. `reviseActivePlan` supersedes only the active revision and inserts a new revision; it does not alter generated sessions. `rollPlanAfterWeekSix` completes the old plan and starts version+1 from the next Monday.

Run: `cd web; npx vitest run src/domain/planning/build-six-week-plan.test.ts src/services/planning/learning-plan-service.test.ts`

Expected: all tests pass, including concurrent duplicate creation and historical revision retention.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/planning web/src/services/planning
git commit -m "feat: generate versioned six-week plans"
```

### Task 3: Pure daily scheduler and immutable adaptive sessions

**Files:**
- Create: `web/src/domain/scheduling/allocate-composition.ts`
- Create: `web/src/domain/scheduling/select-daily-items.ts`
- Create: `web/src/domain/scheduling/daily-scheduler.test.ts`
- Create: `web/src/services/training/create-adaptive-session.ts`
- Create: `web/src/services/training/create-adaptive-session.test.ts`
- Modify: `web/src/services/training/create-daily-session.ts`
- Modify: `web/src/services/training/training-service.test.ts`

**Interfaces:**
- Consumes: active plan revision, current week, parent preferences, due reviews, mastery/dosage states, validated catalog candidates, date, and target seconds.
- Produces: `allocateComposition`, `selectDailyItems`, and `getOrCreateAdaptiveSession`.

- [ ] **Step 1: Write failing allocation and shortage tests**

```ts
expect(allocateComposition(20, "none")).toEqual({ weakness: 9, review: 5, reading: 4, extension: 2 });
expect(allocateComposition(20, "reading")).toEqual({ weakness: 7, review: 5, reading: 7, extension: 1 });
```

Add candidate-selection assertions: overdue review comes first; one skill gets at most two review items; no template repeats; same structure count is at most six; category shortage reallocates review→weakness→reading then shortens; total expected seconds does not exceed target by more than the final selected item's duration.

- [ ] **Step 2: Run and observe missing scheduler failure**

Run: `cd web; npx vitest run src/domain/scheduling/daily-scheduler.test.ts`

Expected: FAIL because scheduler modules do not exist.

- [ ] **Step 3: Implement largest-remainder allocation and stable selection**

```ts
const BASE_RATIOS = { weakness: 45, review: 25, reading: 20, extension: 10 } as const;
export type ScheduledCandidate = {
  templateId: string; skillId: string; structureTag: string; category: PlanCategory;
  difficulty: 1 | 2 | 3 | 4; estimatedSeconds: number; dueOn: string | null;
};
export type ScheduledItem = ScheduledCandidate & {
  variantSeed: string; selectionReason: string; position: number;
};
```

For specialist focus, add 15 to the selected category, subtract first from extension then weakness, never change review below 25. Use largest remainders with tie order review, weakness, reading, extension. Stable candidate sort is overdue days descending, mastery rank, difficulty distance, template ID.

- [ ] **Step 4: Replace fixed first-three creation behind diagnosis gate**

`getOrCreateAdaptiveSession(db, childId, date, now)` rejects with `DiagnosisRequiredError` until diagnosis completes, ensures an active plan, selects candidates, instantiates/validates variants, and writes the session plus every immutable item snapshot in one immediate transaction. On the mixed day of week 4 it creates `kind="assessment"`; other plan days create `kind="daily"`. Repeated calls for the same child/date return the existing session unchanged.

Run: `cd web; npx vitest run src/domain/scheduling/daily-scheduler.test.ts src/services/training/create-adaptive-session.test.ts src/services/training/training-service.test.ts`

Expected: all tests pass; Phase 1 historical session reads and idempotent attempts remain green.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/scheduling web/src/services/training
git commit -m "feat: schedule immutable adaptive sessions"
```

### Task 4: Four-part child session, reading card, scratchpad, and stopping

**Files:**
- Create: `web/src/components/training-segments.tsx`
- Create: `web/src/components/reading-card.tsx`
- Create: `web/src/components/reading-card.test.tsx`
- Create: `web/src/components/scratchpad.tsx`
- Create: `web/src/components/scratchpad.test.tsx`
- Create: `web/src/app/api/child/sessions/[id]/stop/route.ts`
- Create: `web/src/app/api/child/sessions/[id]/stop/route.test.ts`
- Modify: `web/src/domain/training/types.ts`
- Modify: `web/src/app/child/page.tsx`
- Modify: `web/src/app/child/session/[id]/page.tsx`
- Modify: `web/src/components/answer-form.tsx`
- Modify: `web/src/components/answer-form.test.tsx`
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Consumes: adaptive session composition/item category, reading-card requirement, hint/error APIs, and stop service.
- Produces: four-part progress, local reload-safe scratchpad, reading evidence, normal early finish, and resume behavior.

- [ ] **Step 1: Write failing component and stop-route tests**

```tsx
render(<TrainingSegments current="reading" composition={{ warmup: 4, core: 8, reading: 4, correction: 2 }} />);
expect(screen.getByText("旧知识唤醒")).toHaveAttribute("aria-current", "false");
expect(screen.getByText("审题专项")).toHaveAttribute("aria-current", "step");
```

Reading card test requires all six prompts and serializes `{ target, givens, units, usefulFacts, relationship, estimateRange }`. Scratchpad test writes by item ID to localStorage, reloads the component, and restores the text. Stop route test marks the session `completed_early`, preserves completed evidence, and leaves unanswered due reviews outstanding.

- [ ] **Step 2: Run and observe missing child-experience failures**

Run: `cd web; npx vitest run src/components/reading-card.test.tsx src/components/scratchpad.test.tsx src/app/api/child/sessions/[id]/stop/route.test.ts`

Expected: FAIL because the components/route do not exist.

- [ ] **Step 3: Implement the four-part child flow**

Map categories to segments: review→warmup, weakness/computation/equation→core, reading→reading, corrections/due-error variants→correction. Reading-card answers are required only for templates whose immutable snapshot says `readingCard=true`; persist them with the first attempt but do not score them automatically. Scratchpad remains local-only, keyed `math-scratch:<sessionItemId>`, and is removed after session completion.

Show “今天先到这里” after target time or when the user asks to stop; never show missed-item punishment. Early stop invokes the route and returns to child home with remaining work available to future scheduling.

- [ ] **Step 4: Run component, route, and browser-focused tests**

Run: `cd web; npx vitest run src/components/reading-card.test.tsx src/components/scratchpad.test.tsx src/components/answer-form.test.tsx src/app/api/child/sessions/[id]/stop/route.test.ts src/services/training/create-adaptive-session.test.ts`

Expected: all tests pass, including refresh recovery and fresh submission IDs after editable failures.

- [ ] **Step 5: Commit**

```powershell
git add web/src/components web/src/app/child web/src/app/api/child/sessions web/src/domain/training/types.ts web/src/app/globals.css
git commit -m "feat: deliver adaptive four-part child training"
```

### Task 5: Parent plan controls, future week, and weekly report

**Files:**
- Create: `web/src/services/parent/get-plan-dashboard.ts`
- Create: `web/src/services/parent/get-plan-dashboard.test.ts`
- Create: `web/src/app/api/parent/preferences/route.ts`
- Create: `web/src/app/api/parent/preferences/route.test.ts`
- Create: `web/src/components/plan-calendar.tsx`
- Create: `web/src/components/plan-preferences-form.tsx`
- Create: `web/src/components/plan-preferences-form.test.tsx`
- Create: `web/src/components/weekly-report.tsx`
- Modify: `web/src/app/parent/page.tsx`
- Modify: `web/src/app/parent/page.test.tsx`
- Modify: `web/src/app/globals.css`

**Interfaces:**
- Consumes: active plan/revision, scheduler preview, preferences, first-attempt evidence, corrections, hints, due reviews, and effective errors.
- Produces: six-week summary, seven-day preview, preference revision route, and weekly evidence report.

- [ ] **Step 1: Write failing dashboard/form tests**

Seed a plan starting Monday, one rest day, equation focus, first/corrected attempts, hinted evidence, and habit/knowledge errors. Assert:

```ts
expect(view.plan).toMatchObject({ version: 1, revision: 2, currentWeek: 1 });
expect(view.nextSevenDays).toHaveLength(7);
expect(view.nextSevenDays.find((day) => day.date === restDate)?.kind).toBe("rest");
expect(view.weeklyReport).toMatchObject({ firstAnswered: 3, firstCorrect: 2, corrected: 1, hinted: 1 });
expect(view.weeklyReport.errors).toEqual({ knowledge: 1, habit: 1, unknown: 0 });
```

Form test selects five unique weekdays, 20–40 target minutes, and one focus enum; invalid four-day/six-day selections show Chinese validation and do not submit.

- [ ] **Step 2: Run and observe missing dashboard failures**

Run: `cd web; npx vitest run src/services/parent/get-plan-dashboard.test.ts src/components/plan-preferences-form.test.tsx src/app/parent/page.test.tsx`

Expected: FAIL because plan dashboard modules do not exist.

- [ ] **Step 3: Implement plan preview and audited preference revision**

The preview calls the pure scheduler in dry-run mode and stores nothing. Preference POST accepts:

```ts
{
  trainingWeekdays: [1, 2, 3, 4, 6],
  targetMinutes: 30,
  specialistFocus: "equation"
}
```

Validate five unique integers 1..7 and minutes 20..40. In one transaction update preferences, supersede the current plan revision, and create a new revision. Existing sessions keep their original plan revision and composition.

Weekly report uses Shanghai Monday boundaries and first attempts only for accuracy; it separately counts correction, hint, due-review, knowledge-error, and habit-error evidence.

- [ ] **Step 4: Run parent-focused and integration tests**

Run: `cd web; npx vitest run src/services/parent/get-plan-dashboard.test.ts src/components/plan-preferences-form.test.tsx src/app/api/parent/preferences/route.test.ts src/app/parent/page.test.tsx`

Expected: all tests pass; role isolation and historical-plan immutability remain green.

- [ ] **Step 5: Commit**

```powershell
git add web/src/services/parent web/src/components web/src/app/api/parent web/src/app/parent web/src/app/globals.css
git commit -m "feat: add parent planning and weekly reports"
```

### Task 6: Cross-increment migration, browser acceptance, and operations docs

**Files:**
- Modify: `web/scripts/seed-e2e.ts`
- Create: `web/scripts/seed-phase1-migration-fixture.ts`
- Create: `web/e2e/phase2-learning-cycle.spec.ts`
- Modify: `web/e2e/learning-loop.spec.ts`
- Modify: `web/playwright.config.ts`
- Modify: `web/README.md`
- Modify: `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2-roadmap.md`

**Interfaces:**
- Consumes: every Phase 2A/2B/2C public service and migration.
- Produces: deterministic clean/migrated acceptance fixtures and final Phase 2 verification evidence.

- [ ] **Step 1: Add a failing end-to-end acceptance path**

The new spec uses `test.setTimeout(180_000)` and must execute this exact flow:

1. seed a new child with no diagnosis;
2. complete part 1, reload, and resume at the persisted slot;
3. complete all 45 diagnosis slots and observe an initial map plus plan version 1;
4. open a daily session and verify the four composition segments;
5. use a level-1 hint, submit a missing-unit error, correct it, and select “漏了条件或单位”;
6. complete an equation item and verify its review due date;
7. log in as parent, inspect evidence, change to equation focus, and observe plan revision 2 with unchanged historical session revision;
8. verify weekly first-attempt, correction, hint, and habit-error values;
9. assert no horizontal overflow at parent mobile and tablet widths.

The migrated fixture starts from the final Phase 1 migrations, inserts a corrected session, applies all Phase 2 migrations, and verifies the old session still displays and the child is routed to diagnosis.

- [ ] **Step 2: Run the new spec before fixture wiring is complete**

Run: `cd web; npx playwright test e2e/phase2-learning-cycle.spec.ts --project=parent-mobile`

Expected: FAIL because the Phase 2 deterministic fixture/flow is not wired into the browser harness.

- [ ] **Step 3: Add deterministic fixture modes and preserve engine matrix**

Add scripts `e2e:seed:phase2` and `e2e:seed:migrated` without changing the guarded `.tmp` deletion boundary. Keep explicit `tablet-webkit`, `parent-mobile`, and `tablet-chromium` with `channel: "chrome"`. Tag full diagnosis only for WebKit dependency flow; run the same adaptive daily child flow in WebKit and Chrome.

Update README with Phase 2 migration/seed commands, diagnosis reset behavior, persistent SQLite backup reminder, stable Chrome/WebKit prerequisites, and the continued no-AI/single-instance boundary.

- [ ] **Step 4: Run final verification from clean install and migrated database**

```powershell
cd web
npm ci
npm run verify
npm run test:e2e
npm run e2e:seed:migrated
git diff --check
```

Expected: install exits `0`; all lint/type/test/build gates pass; WebKit and stable Chrome pass; migrated seed completes without data/constraint loss; diff check is silent except platform line-ending notices.

- [ ] **Step 5: Commit and mark roadmap gate**

Update the roadmap with the exact test counts and browser scenarios from the completed run, then:

```powershell
git add web/scripts web/e2e web/playwright.config.ts web/package.json web/package-lock.json web/README.md docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2-roadmap.md
git commit -m "test: verify complete phase 2 learning cycle"
```

## Phase 2C and Program Completion Gate

- [ ] Six-week plans are versioned, deterministic, explainable, and preserve earlier revisions.
- [ ] Daily scheduling obeys due-review priority, ratios, focus adjustment, expected-time budget, and all caps.
- [ ] Daily sessions are immutable after creation and survive template/algorithm/plan changes.
- [ ] Child can complete all four segments, reading card, hint, correction, reflection, early stop, and refresh recovery.
- [ ] Parent can view the next week, revise preferences, and read a traceable weekly report.
- [ ] New and populated Phase 1 databases both pass every migration and browser flow.
- [ ] `npm ci`, `npm run verify`, WebKit, stable Chrome, migrated seed, and `git diff --check` pass.
