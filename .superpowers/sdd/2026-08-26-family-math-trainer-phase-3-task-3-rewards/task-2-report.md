# Task 2 report

- Status: complete
- Commit: `feat: award points and badges from training`
- Tests: focused reward/submission tests pass (32 tests); `npm run verify` passes (52 files, 363 tests, lint, typecheck, build).
- RED evidence: the new integration test first failed because `submitAttempt` returned no `rewards` field.
- Implementation: added transactional reward event insertion, lifetime totals, badge threshold transitions, duplicate replay summaries, and preserved existing idempotency/evidence/error behavior.
- Concerns: estimate badge classification relies on existing snapshot metadata (`estimate: true` or a structure tag containing `estimate`), as required by the current catalog contract.

## Round 1 fixes

- Status: complete
- Fixes: adaptive equation/estimate eligibility now receives `structureTagSnapshot`; correction source keys are child/item scoped; point and badge summaries increment only after a successful insert.
- Coverage added: repeated wrong/correct correction dedupe, review recall plus planned completion, reading-card badge threshold crossing, and duplicate replay.
- Verification: focused tests pass (17 tests); `npm run verify` passes (52 files, 366 tests, lint, typecheck, build).
