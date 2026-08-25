# Family Math Trainer Phase 3 Task 3 Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small, idempotent rewards ledger that gives the child points and behavior-focused badges for reading carefully, correcting work, recalling review items, and completing planned sessions.

**Architecture:** Store immutable reward events in the existing Drizzle database. A pure rules module decides which behavior events and badge thresholds apply; a small service writes deduplicated events and returns the attempt's earned points, new badges, and lifetime points. `submitAttempt` calls the service inside its existing transaction and returns the summary for the existing answer feedback component.

**Tech Stack:** Next.js/React, TypeScript, Drizzle ORM with SQLite, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-family-math-training-web-design.md` (section 14 behavior rewards, section 17 RewardEvent, section 20 deduplication tests); `docs/superpowers/specs/2026-08-20-family-math-trainer-phase-2-design.md` (Phase 3 rewards scope).

## Global Constraints

- Reward careful process behavior; never reward speed, ranking, or punitive streak resets.
- Existing attempt idempotency must remain intact, and each reward source must be independently idempotent.
- Preserve the current tablet-first UI and answer flow; show only a concise earned summary when data is available.
- Do not add provider/API-key, deployment, or leaderboard work in this task.
- Keep the diff minimal and reuse the existing `submitAttempt` transaction and Drizzle migration workflow.

---

### Task 1: Reward rules and persistence contract

**Files:**
- Create: `web/src/domain/rewards/reward-rules.ts`
- Create: `web/src/domain/rewards/reward-rules.test.ts`
- Modify: `web/src/db/schema.ts`
- Create: generated migration under `web/drizzle/`
- Test: `web/src/db/*` existing migration/test database coverage as needed

**Interfaces:**
- Produces `RewardAction`, `RewardAward`, `RewardBadge`, and pure rule helpers consumed by Task 2.
- Produces a `rewardEvents` table with unique `sourceKey`, child/session/attempt references, event kind, code, points, timestamp, and JSON metadata.

- [ ] **Step 1: Write failing rule tests**

  Cover these exact rules: reading-card completion = 2 points; relationship explanation = 1 point; correction success = 3 points; first-correct review recall = 5 points; planned session completion = 5 points; no action for speed; badge thresholds of 3 reading cards (审题侦探), 3 non-empty unit checks (单位检查员), 5 correct equation items (方程平衡师), and 5 estimate items (估算能手).

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

  Run `npm run test:run -- src/domain/rewards/reward-rules.test.ts` from `web`; it must fail because the reward rules module does not exist yet.

- [ ] **Step 3: Add the minimal pure rules and schema**

  Use stable kebab-case codes and labels from the design. Keep badge eligibility as deterministic counts over prior behavior events. Add the table only; do not introduce a generalized event framework.

- [ ] **Step 4: Generate and inspect the Drizzle migration**

  Run `npm run db:generate`, inspect the SQL for the unique source key and foreign keys, then run the focused rule/schema tests.

- [ ] **Step 5: Commit**

  `git add web/src/domain/rewards web/src/db/schema.ts web/drizzle docs/superpowers/plans/2026-08-26-family-math-trainer-phase-3-task-3-rewards.md && git commit -m "feat: add reward rules and event ledger"`

### Task 2: Award rewards from attempt submission

**Files:**
- Create: `web/src/services/training/award-rewards.ts`
- Create: `web/src/services/training/award-rewards.test.ts`
- Modify: `web/src/services/training/submit-attempt.ts`
- Modify: relevant training service tests

**Interfaces:**
- Consumes the pure rules and `rewardEvents` table from Task 1.
- Produces `RewardSummary = { pointsEarned: number; totalPoints: number; newBadges: Array<{ code: string; label: string }> }`.

- [ ] **Step 1: Write failing integration tests**

  Use the existing test database and real `submitAttempt` flow to prove: first reading-card submission awards points once; correction awards 3 points; first-correct review awards 5 points; session completion awards 5 points; duplicate `clientSubmissionId` and repeated completion do not duplicate events; lifetime points sum correctly and newly crossed badges are returned.

- [ ] **Step 2: Run focused tests and confirm failure**

  Run `npm run test:run -- src/services/training/award-rewards.test.ts src/services/training/submit-attempt.test.ts`; failure should identify missing reward integration, not a fixture typo.

- [ ] **Step 3: Implement the minimal transactional award service**

  Insert events with `onConflictDoNothing` on `sourceKey`. Use source keys scoped to child and event origin. Count only persisted behavior events for badge thresholds, insert each badge once, and calculate lifetime points from the ledger. Invoke it only after the existing attempt/evidence writes in the same transaction.

- [ ] **Step 4: Verify focused and full tests**

  Run the focused command, then `npm run verify` from `web`.

- [ ] **Step 5: Commit**

  `git add web/src/services/training web/src/services/training/submit-attempt.ts && git commit -m "feat: award points and badges from training"`

### Task 3: Return and display the reward summary

**Files:**
- Modify: `web/src/components/answer-form.tsx`
- Modify: route/client result types and tests only where required by the new response field

**Interfaces:**
- Consumes `RewardSummary` returned by `submitAttempt` and the child attempts API.
- Produces a concise accessible feedback line for points earned and newly earned badge labels; absent/legacy results remain valid.

- [ ] **Step 1: Write a failing component test**

  Submit a mocked correct answer with `{ rewards: { pointsEarned: 2, totalPoints: 12, newBadges: [{ code: 'reading-detective', label: '审题侦探' }] } }` and assert the earned points and badge label are visible. Also assert a result without `rewards` still renders normally.

- [ ] **Step 2: Run the focused component test and verify failure**

  Run the existing answer-form test command; it must fail only because reward feedback is not rendered.

- [ ] **Step 3: Add the smallest feedback block**

  Keep it near the existing correctness feedback, use plain text/semantic markup, and avoid animations, rankings, or a new page.

- [ ] **Step 4: Run focused tests and `npm run verify`**

- [ ] **Step 5: Commit**

  `git add web/src/components/answer-form.tsx web/src && git commit -m "feat: show earned math rewards"`

## Self-review checklist

- [ ] Every rule in the behavior-reward section maps to a test and a source key.
- [ ] No reward depends on elapsed time, answer speed, ranking, or streak resets.
- [ ] Duplicate submissions and repeated session completion cannot create duplicate points or badges.
- [ ] The migration is included and `npm run verify` passes.
- [ ] Existing answer feedback works when the optional reward field is absent.
