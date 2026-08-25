# Phase 3 Task 3 Rewards — Final Fix Report

## Outcome

All five Important findings and both listed Minors from `final-review.md` are fixed in one scoped wave.

## Fixes

1. `completed_early` rewards
   - The supported stop route now writes the 5-point `session-completed` event inside the same immediate transaction as the first `in_progress -> completed_early` update.
   - It uses the existing stable source key `session-completed:<sessionId>` and `onConflictDoNothing`, so retries award exactly once.
   - The stop route remains limited to `daily` and `assessment`; normal attempt completion still excludes `practice` and `diagnostic`.

2. Exact duplicate replay
   - Attempts now persist the exact returned reward summary in nullable `attempts.reward_summary` after rewards are awarded, within the existing submission transaction.
   - Duplicate `clientSubmissionId` replay returns that stored summary instead of reconstructing lifetime points from the non-unique `submittedAt <=` boundary.
   - Legacy attempts with a null or unreadable snapshot retain the prior reconstruction fallback.

3. Corrected equation and estimate badge progress
   - Correct equation/estimate classification no longer requires `priorAttemptCount === 0`.
   - Review recall remains first-attempt-only.
   - Existing per-item source keys continue to make corrected and repeated submissions count at most once.

4. Reward feedback visibility
   - Reward feedback is rendered independently of numerical correctness.
   - The block appears only when points were earned or at least one new badge was awarded.
   - A zero-point line is suppressed, including badge-only summaries.
   - The independent reward block retains polite live-region semantics next to the correctness feedback.

5. Drizzle alignment
   - Added the missing `reward_events_kind` check metadata to the reward migration snapshot.
   - Restored the complete reward table metadata in the later ordered Phase 2C snapshots so generation does not rediscover an already-created table.
   - Added `20260825130000_attempt_reward_summary`, containing only the nullable `reward_summary` column migration.
   - A second `npm run db:generate` reported: `No schema changes, nothing to migrate`.

6. Review Minors
   - Production awards now use Task 1 `pointValues` for all five point-bearing rules.
   - Removed both reward-event preflight SELECT paths; insert `changes` after `onConflictDoNothing` is the single idempotency result.

## TDD evidence

Regression tests were added before production changes and observed failing for the intended reasons:

- Stop route: expected one completion reward event, received none.
- Same-millisecond replay: original total was 3, replay total became 6.
- Corrected equation/estimate: expected threshold badges, received no badges.
- Incorrect-answer UI: earned 3-point summary was absent.
- Empty reward UI: `获得 0 分` was present.
- Migration contract: `reward_summary` was absent from migrated attempts.

After the fixes, the focused command passed all 50 tests in four files:

```text
npm run test:run -- 'src/app/api/child/sessions/[id]/stop/route.test.ts' \
  src/services/training/award-rewards.test.ts \
  src/components/answer-form.test.tsx \
  src/db/schema.test.ts

Test Files  4 passed (4)
Tests       50 passed (50)
```

## Final verification

- `npm run db:generate`: no schema changes.
- `npm run verify`: passed.
  - ESLint: passed.
  - TypeScript: passed.
  - Vitest: 52 files, 372 tests passed.
  - Next.js production build: passed.
- `git diff --check`: passed; only Git line-ending notices were emitted.

## Scope

No dashboard, animation, dependency, or unrelated refactor was added. The existing API shape and immediate transaction boundaries remain intact; the only database addition is one nullable text snapshot column.
