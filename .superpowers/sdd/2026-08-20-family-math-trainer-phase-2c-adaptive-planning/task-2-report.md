# Task 2 report

Implemented the deterministic six-week planner and versioned plan service.

## Verification

- `cd web; npx vitest run src/domain/planning/build-six-week-plan.test.ts src/services/planning/learning-plan-service.test.ts` — 8 passed.
- `cd web; npm run lint` — passed.
- `cd web; npm run test:run` — 41 files, 328 tests passed.
- `cd web; npm run typecheck` — passed.
- `git diff --check` — passed.

The initial red run failed as intended because both new planner and service modules did not exist.

## Review follow-up

- `buildSixWeekPlan` now normalizes any date key to its Shanghai Monday before deriving the six-week boundary; direct Wednesday input and the Shanghai midnight boundary are covered by the planner test.
- The Node `DatabaseSync` API is synchronous, so Promise overlap is not available. The service test uses two connections to a temporary SQLite file and an authorizer hook during the first connection's read. The second connection is forced to attempt `BEGIN IMMEDIATE` while the first transaction owns the write lock, fails at that statement, then retries after commit. The retry returns the same plan and the database has exactly one active plan.
- `cd web; npx vitest run src/domain/planning/build-six-week-plan.test.ts src/services/planning/learning-plan-service.test.ts` — 10 passed.
- `cd web; npm run typecheck` — passed.
- `git diff --check` — passed.
