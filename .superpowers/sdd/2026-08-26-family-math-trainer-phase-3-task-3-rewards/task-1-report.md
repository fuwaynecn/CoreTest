# Task 1 Report — Reward rules and persistence contract

## Status

Complete. Implementation commit: `4358f0bd0ee67341ca47a447346eec00a150e83b` (`feat: add reward rules and event ledger`).

## Commands and output

- `npm run test:run -- src/domain/rewards/reward-rules.test.ts` (red): failed during collection because `./reward-rules` did not exist.
- `npm run test:run -- src/domain/rewards/reward-rules.test.ts` (green): 3 tests passed.
- `npm run db:generate`: generated migration `20260825064451_wide_mauler`.
- `npm run test:run -- src/domain/rewards/reward-rules.test.ts`: 3 tests passed.
- `npm run verify`: lint passed, typecheck passed, 51 test files / 362 tests passed, and Next build passed.

## Migration

`web/drizzle/20260825064451_wide_mauler/migration.sql` creates `reward_events` with the requested foreign keys, unique `source_key`, points/badge kind column, defaults, and nullable session/attempt references. Drizzle also generated the matching snapshot.

## Concerns

No known concerns. Reward rules are pure and ignore elapsed time; event-ledger idempotency is represented by the unique `source_key` constraint.

## Round 1 fixes

- Added the SQL-level `reward_events_kind` CHECK constraint and updated the migration SQL.
- Extended `schema.test.ts` to cover reward columns/defaults, all foreign-key targets, `source_key` uniqueness, and rejection of invalid kinds.
- Pinned exact badge codes, labels, thresholds, and count keys in the reward-rule test.
- Red evidence: schema test failed because the invalid kind was accepted.
- Focused verification: 2 files, 10 tests passed.
- `npm run verify`: lint, typecheck, 51 files / 362 tests, and build passed. One earlier full-suite run had a transient 5-second seed-test timeout; the immediate rerun passed.
