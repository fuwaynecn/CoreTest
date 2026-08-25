# Task 6 report

## TDD

- Red: `npx playwright test e2e/phase2-learning-cycle.spec.ts --project=parent-mobile --no-deps` completed 45 diagnosis slots and showed the completion page, but `learning_plans` v1/r1 count was `0`.
- Green: diagnosis completion now calls the existing idempotent `createInitialPlan`; the same path creates exactly one v1/r1 plan.

## Verification

- `npm ci` passed.
- `npm run verify` passed: lint, typecheck, 50 test files / 359 tests, and production build.
- `npm run test:e2e` passed with four isolated serial phases: `parent-mobile`, `phase2-webkit` (3 scenarios), `tablet-chromium`, and `phase2-chromium` (2 scenarios).
- `npm run e2e:seed:migrated` passed from the Phase 1 migration lineage through all Phase 2 migrations.
- `npm run db:generate` and `git diff --check` passed.

## Browser scope

WebKit and stable Chrome were available. The isolated `phase2-webkit` project ran all three Phase 2 scenarios, including the 45-slot diagnosis. The `phase2-chromium` project uses stable Chrome (`channel: "chrome"`) and ran both the adaptive daily/parent flow and migrated-history scenario. Full diagnosis remains WebKit-only; it is the only scenario carrying `@full-diagnosis`.

## Fixture isolation and migration evidence

- The browser harness keeps its long-lived SQLite file open, so clean Phase 2 fixtures use a child-scoped in-database reset rather than deleting `.tmp/e2e.sqlite`; the guarded `.tmp` deletion boundary remains in the seed scripts.
- The CLI migrated seed begins with the final Phase 1 migrations, persists legacy wrong answer `11` and corrected answer `12` before Phase 2 exists, then applies Phase 2 migrations. It only updates the newly available correction number and asserts both original rows survive.
- The browser uses a same-file presentation fixture because its web server holds SQLite open on Windows. It independently verifies that parent evidence renders `11` and `12` and the child is routed to initial diagnosis; cross-migration preservation is the CLI seed's responsibility.

## Follow-up review fix

- The initial plan is now inserted through `createInitialPlanInTransaction` inside the final diagnosis transaction. A trigger-forced plan insertion failure leaves 44 attempts, no plan, and an in-progress diagnosis; focused diagnosis/planning tests: 26 passed.
- The final clean-install and verification evidence is recorded above; no browser or gate result is inferred from an unexecuted command.
