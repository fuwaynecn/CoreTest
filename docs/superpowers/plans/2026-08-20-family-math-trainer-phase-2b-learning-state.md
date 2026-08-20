# Family Math Trainer Phase 2B Learning State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert immutable diagnosis and training attempts into traceable error causes, five-state mastery, spaced-review schedules, and adaptive computation/equation dosage.

**Architecture:** An append-only evidence layer is the source of truth. Pure reducers derive mastery, review, and dosage states from ordered evidence; transactional services append evidence and persist derived snapshots atomically. Parent read models expose both summaries and the exact evidence behind them.

**Tech Stack:** Node.js 24, Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5, SQLite, Drizzle ORM 1.0.0-rc.4, Zod 4.4.3, Vitest 3.2.7, Testing Library, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-20-family-math-trainer-phase-2-design.md`

## Global Constraints

- Complete and review Phase 2A before starting this plan.
- Apply every global constraint from `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2-roadmap.md`.
- Only the earliest attempt for a session item contributes first-attempt mastery evidence; corrections remain visible but never rewrite it.
- Missing legacy telemetry remains unknown; migration must not invent hint use, duration, or error cause.
- `stable` is impossible from diagnosis alone and requires a successful due review at an interval of at least seven days plus a different structure tag.
- Review levels `0..4` map exactly to 1, 3, 7, 14, and 30 Shanghai calendar days.
- Computation/equation complexity advances only after two cross-day sessions at or above 90%, no level-2/3 hint, and no failed due review.
- Low accuracy changes support and review timing, not punitive volume; same-structure items remain capped at six per session.

---

### Task 1: Evidence, schedule, dosage, and error schema

**Files:**
- Modify: `web/src/db/schema.ts`
- Modify: `web/src/db/schema.test.ts`
- Create: `web/drizzle/20260820100000_phase2b_learning_state/migration.sql`
- Create: `web/drizzle/20260820100000_phase2b_learning_state/snapshot.json`

**Interfaces:**
- Consumes: Phase 2A diagnosis/session/item schema and populated Phase 1/2A data.
- Produces: append-only `mastery_evidence`, `error_observations`, `review_schedules`, and `dosage_states` tables plus attempt telemetry columns.

- [ ] **Step 1: Extend the populated migration regression**

Start from a database containing a Phase 1 corrected attempt and a completed Phase 2A diagnosis. After migration assert:

```ts
expect(columns("attempts")).toEqual(expect.arrayContaining([
  "active_duration_ms", "hint_level", "hint_count", "correction_number",
]));
expect(primaryKeyColumns("mastery_evidence")).toEqual(["id"]);
expect(uniqueIndexColumns("mastery_evidence_source_idx")).toEqual(["session_item_id"]);
expect(primaryKeyColumns("review_schedules")).toEqual(["child_id", "skill_id"]);
expect(primaryKeyColumns("dosage_states")).toEqual(["child_id", "track"]);
expect(foreignKeyCheck(sqlite)).toEqual([]);
expect(sqlite.prepare("select active_duration_ms, hint_level from attempts where id=?").get(oldAttemptId))
  .toEqual({ active_duration_ms: null, hint_level: null });
```

- [ ] **Step 2: Run and observe missing schema failures**

Run: `cd web; npx vitest run src/db/schema.test.ts`

Expected: FAIL on missing telemetry/evidence tables.

- [ ] **Step 3: Add exact tables and constraints**

```ts
export const masteryEvidence = sqliteTable("mastery_evidence", {
  id: text("id").primaryKey(),
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  sessionItemId: text("session_item_id").notNull().references(() => sessionItems.id),
  purpose: text("purpose", { enum: ["diagnostic", "learning", "review", "assessment"] }).notNull(),
  firstAttemptCorrect: integer("first_attempt_correct", { mode: "boolean" }).notNull(),
  independent: integer("independent", { mode: "boolean" }).notNull(),
  difficulty: integer("difficulty").notNull(),
  structureTag: text("structure_tag").notNull(),
  occurredOn: text("occurred_on").notNull(),
  occurredAt: integer("occurred_at").notNull(),
}, (table) => [uniqueIndex("mastery_evidence_source_idx").on(table.sessionItemId)]);
```

`error_observations` stores system candidate, child self-report, parent correction, previous value, actor ID, and timestamps without deleting prior revisions. `review_schedules` stores level, due date, last result, updated time. `dosage_states` uses track enum `computation/equation`, level, weekly target, session minimum/target/maximum, reason JSON, and updated time.

- [ ] **Step 4: Generate and verify migration**

Run: `cd web; npm run db:generate`

Inspect that attempt telemetry is nullable for legacy rows and evidence is backfilled only where first-attempt facts are known. Then run: `cd web; npx vitest run src/db/schema.test.ts`.

Expected: migration tests pass and no foreign-key violations exist.

- [ ] **Step 5: Commit**

```powershell
git add web/src/db/schema.ts web/src/db/schema.test.ts web/drizzle
git commit -m "feat: add learning evidence state schema"
```

### Task 2: Hint telemetry and active attempt timing

**Files:**
- Create: `web/src/domain/training/attempt-telemetry.ts`
- Create: `web/src/domain/training/attempt-telemetry.test.ts`
- Create: `web/src/app/api/child/hints/route.ts`
- Create: `web/src/app/api/child/hints/route.test.ts`
- Modify: `web/src/components/answer-form.tsx`
- Modify: `web/src/components/answer-form.test.tsx`
- Modify: `web/src/app/api/child/attempts/route.ts`
- Modify: `web/src/app/api/child/attempts/route.test.ts`

**Interfaces:**
- Consumes: session-item hint-ladder snapshot, visibility/focus events, and attempt command.
- Produces: `AttemptTelemetry`, child-only sequential hint API, and validated telemetry attached to attempt submission.

- [ ] **Step 1: Write failing telemetry and form tests**

```ts
expect(normalizeTelemetry({ activeDurationMs: -1, hintLevel: 9, hintCount: 99 }))
  .toEqual({ activeDurationMs: 0, hintLevel: 3, hintCount: 3 });
expect(normalizeTelemetry({ activeDurationMs: 999_999, hintLevel: 0, hintCount: 0 }, 120))
  .toEqual({ activeDurationMs: 480_000, hintLevel: 0, hintCount: 0 });
```

In the form test, advance fake timers while visible, dispatch `visibilitychange` to hidden, advance again, submit, and assert only visible time is sent. Requesting hints returns levels 1, 2, 3 in order; a fourth request repeats level 3 without increasing count.

- [ ] **Step 2: Run and observe missing telemetry behavior**

Run: `cd web; npx vitest run src/domain/training/attempt-telemetry.test.ts src/components/answer-form.test.tsx src/app/api/child/hints/route.test.ts`

Expected: FAIL because telemetry and hint route do not exist.

- [ ] **Step 3: Implement bounded informational telemetry**

```ts
export type AttemptTelemetry = {
  activeDurationMs: number;
  hintLevel: 0 | 1 | 2 | 3;
  hintCount: number;
};

export function normalizeTelemetry(input: AttemptTelemetry, estimatedSeconds = 300): AttemptTelemetry {
  return {
    activeDurationMs: Math.min(Math.max(Math.trunc(input.activeDurationMs), 0), estimatedSeconds * 4_000),
    hintLevel: Math.min(Math.max(Math.trunc(input.hintLevel), 0), 3) as 0 | 1 | 2 | 3,
    hintCount: Math.min(Math.max(Math.trunc(input.hintCount), 0), 3),
  };
}
```

Timing is evidence only and never affects correctness. Hint route returns only the next allowed snapshot hint for a child-owned in-progress item; it does not expose answer specs or explanations.

- [ ] **Step 4: Persist telemetry through the idempotent attempt route**

Extend the route command with `activeDurationMs`, `hintLevel`, and `hintCount`. Existing client submission IDs return their original result and telemetry remains unchanged. Run:

`cd web; npx vitest run src/domain/training/attempt-telemetry.test.ts src/components/answer-form.test.tsx src/app/api/child/hints/route.test.ts src/app/api/child/attempts/route.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/training/attempt-telemetry* web/src/app/api/child web/src/components/answer-form*
git commit -m "feat: capture hint and attempt telemetry"
```

### Task 3: Error-cause rules, child reflection, and parent corrections

**Files:**
- Create: `web/src/domain/errors/classify-error.ts`
- Create: `web/src/domain/errors/classify-error.test.ts`
- Create: `web/src/services/training/error-observation-service.ts`
- Create: `web/src/services/training/error-observation-service.test.ts`
- Create: `web/src/app/api/child/error-reflections/route.ts`
- Create: `web/src/app/api/parent/error-observations/[id]/route.ts`
- Modify: `web/src/components/answer-form.tsx`
- Modify: `web/src/components/answer-form.test.tsx`

**Interfaces:**
- Consumes: immutable answer spec, normalized/written answer, template common-error metadata, child reflection, and parent correction.
- Produces: `classifyError(input): ErrorCause`, `saveChildReflection`, `correctErrorObservation`, and effective cause/category read model.

- [ ] **Step 1: Write failing classification and audit tests**

```ts
expect(classifyError(numberQuestion({ unit: "元" }), "7.5")).toBe("missing_unit");
expect(classifyError(numberQuestion({ value: 32, tolerance: 0 }), "320")).toBe("range_check");
expect(classifyError(equationQuestion("3x+5=26"), "6")).toBe("relationship");
expect(errorCategory("missing_unit")).toBe("habit");
expect(errorCategory("relationship")).toBe("knowledge");
expect(errorCategory("unknown")).toBe("unknown");
```

Service test must preserve system candidate and child selection after a parent correction, append actor/time audit data, reject a correction from a child, and leave mastery unchanged.

- [ ] **Step 2: Run and observe missing classifier/service**

Run: `cd web; npx vitest run src/domain/errors/classify-error.test.ts src/services/training/error-observation-service.test.ts`

Expected: FAIL because error modules do not exist.

- [ ] **Step 3: Implement conservative deterministic classification**

Classification priority is: missing required unit; parse/range anomaly at 10x or 0.1x expected; equation non-solution; template-declared copied-number pattern; template-declared calculation pattern; incomplete-reading answer target; unknown. Never infer a subjective cause from elapsed time.

Child values are exactly `did_not_read`, `missed_condition_or_unit`, `calculation_slip`, `method_unknown`; mapping to report category is explicit. Child reflection is optional and accepted once after an incorrect first attempt or correction. Parent correction appends a revision and never mutates the earlier values.

- [ ] **Step 4: Wire forms/routes and run focused tests**

After a correction, render four large reflection buttons plus “暂时不选”. Parent route requires parent role and validates the observation belongs to the configured child.

Run: `cd web; npx vitest run src/domain/errors/classify-error.test.ts src/services/training/error-observation-service.test.ts src/components/answer-form.test.tsx src/app/api/child/attempts/route.test.ts`

Expected: all tests pass; answer correctness and idempotency tests remain unchanged.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/errors web/src/services/training/error-observation-service* web/src/app/api/child web/src/app/api/parent web/src/components/answer-form*
git commit -m "feat: record explainable error causes"
```

### Task 4: Append-only evidence and five-state mastery reducer

**Files:**
- Replace: `web/src/domain/training/mastery.ts`
- Replace: `web/src/domain/training/mastery.test.ts`
- Create: `web/src/services/training/record-learning-evidence.ts`
- Create: `web/src/services/training/record-learning-evidence.test.ts`
- Modify: `web/src/services/training/submit-attempt.ts`
- Modify: `web/src/services/diagnosis/diagnosis-service.ts`

**Interfaces:**
- Consumes: ordered `MasteryEvidenceInput[]` and current status.
- Produces: `deriveMasteryState(evidence): MasteryState` and transactional first-attempt evidence insertion.

- [ ] **Step 1: Replace aggregate-count tests with rule-boundary tests**

```ts
expect(deriveMasteryState([]).status).toBe("undiagnosed");
expect(deriveMasteryState(diagnosticEvidence({ weightedRate: 49 }))).toMatchObject({ status: "needs_support" });
expect(deriveMasteryState(diagnosticEvidence({ weightedRate: 50 }))).toMatchObject({ status: "learning" });
expect(deriveMasteryState(diagnosticEvidence({ weightedRate: 80, distinctTemplates: 2 })))
  .toMatchObject({ status: "basic" });
expect(deriveMasteryState(stableEvidence({ dueIntervalDays: 7, distinctStructures: 2 })))
  .toMatchObject({ status: "stable" });
```

Add explicit tests for two-day support→learning, five-attempt 80% learning→basic, one failed due review stable→basic, one failed due review basic→learning, and two failed due reviews on different Shanghai dates→needs_support.

- [ ] **Step 2: Run and observe failures against Phase 1 count logic**

Run: `cd web; npx vitest run src/domain/training/mastery.test.ts`

Expected: FAIL because the existing reducer has only three states and aggregate counts.

- [ ] **Step 3: Implement a pure evidence reducer**

```ts
export type MasteryEvidenceInput = {
  purpose: "diagnostic" | "learning" | "review" | "assessment";
  templateId: string; structureTag: string; difficulty: 1 | 2 | 3 | 4;
  firstAttemptCorrect: boolean; independent: boolean;
  occurredOn: string; reviewIntervalDays: 0 | 1 | 3 | 7 | 14 | 30;
};

export type MasteryState = {
  status: MasteryStatus;
  evidenceCount: number;
  firstAttemptCorrectCount: number;
  reasonCode: string;
};
```

Sort evidence by `(occurredOn, occurredAt, id)` in the service before invoking the reducer. The reducer follows design section 6.4 verbatim and returns a reason code used by parent explanations.

- [ ] **Step 4: Insert evidence only on the first attempt**

The attempt transaction detects whether the item already has mastery evidence. The first submission inserts exactly one row, even if wrong; later corrections remain separate attempt rows and read models derive `corrected` without mutating mastery evidence or `firstAttemptCorrect`. Diagnosis completion imports its first-attempt rows once.

Run: `cd web; npx vitest run src/domain/training/mastery.test.ts src/services/training/record-learning-evidence.test.ts src/services/training/training-service.test.ts src/services/diagnosis/diagnosis-service.test.ts`

Expected: all tests pass, including corrected first-attempt immutability and template-edit history.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/training/mastery* web/src/services/training web/src/services/diagnosis
git commit -m "feat: derive five-state mastery from evidence"
```

### Task 5: Spaced review and computation/equation dosage reducers

**Files:**
- Create: `web/src/domain/review/next-review.ts`
- Create: `web/src/domain/review/next-review.test.ts`
- Create: `web/src/domain/dosage/derive-dosage.ts`
- Create: `web/src/domain/dosage/derive-dosage.test.ts`
- Create: `web/src/services/training/update-learning-state.ts`
- Create: `web/src/services/training/update-learning-state.test.ts`
- Modify: `web/src/services/training/record-learning-evidence.ts`

**Interfaces:**
- Consumes: first-attempt result, independence, current review level, Shanghai date, two-session track summaries, and due-review outcome.
- Produces: `nextReviewState`, `deriveDosageState`, and one transactional state update after evidence append.

- [ ] **Step 1: Write failing review and dosage tables**

```ts
expect(nextReviewState({ level: 0, outcome: "independent_correct", on: "2026-08-20" }))
  .toEqual({ level: 1, dueOn: "2026-08-23", lastResult: "independent_correct" });
expect(nextReviewState({ level: 3, outcome: "hinted_correct", on: "2026-08-20" }))
  .toEqual({ level: 2, dueOn: "2026-08-27", lastResult: "hinted_correct" });
expect(nextReviewState({ level: 4, outcome: "incorrect", on: "2026-08-20" }))
  .toEqual({ level: 0, dueOn: "2026-08-21", lastResult: "incorrect" });
```

Dosage tests assert: two cross-day 90% independent sessions plus passed due review advance one level; 70–89 holds; below 70 holds/lowers complexity without raising volume; equation targets remain 4–6 per session and 15–20 per week; computation targets remain within the approved ranges.

- [ ] **Step 2: Run and observe missing reducers**

Run: `cd web; npx vitest run src/domain/review/next-review.test.ts src/domain/dosage/derive-dosage.test.ts`

Expected: FAIL because the reducers do not exist.

- [ ] **Step 3: Implement pure review/dosage transitions**

```ts
const REVIEW_DAYS = [1, 3, 7, 14, 30] as const;
export type ReviewOutcome = "independent_correct" | "hinted_correct" | "corrected" | "incorrect";

export type DosageState = {
  track: "computation" | "equation";
  level: number;
  weeklyTarget: number;
  sessionMin: number;
  sessionTarget: number;
  sessionMax: number;
  reasonCode: "advance" | "hold" | "support" | "insufficient_evidence";
};
```

Use `addShanghaiDays`. Computation level range is 1..7; equation is 1..6. Low performance changes `reasonCode` and may reduce level by one, but preserves target at or below its current value and never exceeds the approved maximum.

- [ ] **Step 4: Persist mastery, review, and dosage atomically**

`updateLearningState(tx, evidenceId)` reads ordered evidence, derives all three states, and upserts them before the attempt transaction commits. A forced reducer error must roll back attempt, evidence, mastery, review, and dosage writes together.

Run: `cd web; npx vitest run src/domain/review/next-review.test.ts src/domain/dosage/derive-dosage.test.ts src/services/training/update-learning-state.test.ts src/services/training/training-service.test.ts`

Expected: all tests pass, including transaction rollback.

- [ ] **Step 5: Commit**

```powershell
git add web/src/domain/review web/src/domain/dosage web/src/services/training
git commit -m "feat: schedule reviews and adaptive dosage"
```

### Task 6: Parent learning-state views and acceptance

**Files:**
- Create: `web/src/services/parent/get-learning-state.ts`
- Create: `web/src/services/parent/get-learning-state.test.ts`
- Create: `web/src/components/ability-map.tsx`
- Create: `web/src/components/error-summary.tsx`
- Create: `web/src/components/dosage-summary.tsx`
- Modify: `web/src/app/parent/page.tsx`
- Modify: `web/src/app/parent/page.test.tsx`
- Modify: `web/src/app/globals.css`
- Create: `web/e2e/learning-state.spec.ts`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: mastery/evidence/error/review/dosage tables.
- Produces: one parent read model with traceable reasons and correction actions.

- [ ] **Step 1: Write failing read-model and page tests**

Seed one knowledge error, two habit errors, a corrected attempt, a due review, and equation/computation dosage. Assert:

```ts
expect(view.abilityMap.find((item) => item.skillCode === "equation-two-step"))
  .toMatchObject({ status: "learning", reasonCode: "recent_five_below_basic", evidenceCount: 5 });
expect(view.errorSummary).toMatchObject({ knowledge: 1, habit: 2, unknown: 0 });
expect(view.dosage.equation).toMatchObject({ level: 4, sessionMin: 4, sessionMax: 6 });
expect(view.dueReviews[0].dueOn).toBe("2026-08-23");
```

Page test requires all five Chinese state labels, visible “为什么是这个状态”, and links from summary to exact evidence.

- [ ] **Step 2: Run and observe missing parent-state UI**

Run: `cd web; npx vitest run src/services/parent/get-learning-state.test.ts src/app/parent/page.test.tsx`

Expected: FAIL because parent learning-state modules do not exist.

- [ ] **Step 3: Implement read models and responsive components**

Keep queries in the service; components receive serializable view types. Effective error cause priority is parent correction, child self-report, system candidate. Display duration as contextual evidence only and never label a child “slow”. Ability state explanations include thresholds and relevant dates in plain Chinese.

- [ ] **Step 4: Add browser acceptance and run full verification**

E2E must submit a missing-unit error, correction, child reflection, and a parent correction; then assert habit/knowledge counts, evidence drill-down, current review date, and equation/computation dosage. Verify no horizontal overflow on parent mobile and tablet.

Run:

```powershell
cd web
npm run verify
npm run test:e2e
git diff --check
```

Expected: all tests/build/browser projects pass and Phase 1/2A flows remain green.

- [ ] **Step 5: Commit**

```powershell
git add web/src/services/parent web/src/components web/src/app/parent web/src/app/globals.css web/e2e web/README.md
git commit -m "feat: explain learning state to parents"
```

## Phase 2B Completion Gate

- [ ] Every formal first attempt creates one immutable mastery evidence row; correction never rewrites it.
- [ ] Hint/timing/error telemetry is bounded, auditable, and does not affect correctness.
- [ ] All five mastery states and every transition have boundary tests.
- [ ] Review intervals and Shanghai date boundaries have complete tests.
- [ ] Computation/equation dosage follows the exact cross-day thresholds and volume caps.
- [ ] Parent summaries drill down to exact evidence and allow audited error correction.
- [ ] `npm run verify`, WebKit, stable Chrome, and `git diff --check` pass.
