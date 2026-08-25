# Phase 3 Task 3 SDD Ledger

- Plan: `docs/superpowers/plans/2026-08-26-family-math-trainer-phase-3-task-3-rewards.md`
- Scope approved by user: lightweight points and behavior-focused badges; visual polish is deferred.
- Ruling: keep rewards inside the existing attempt transaction and expose only a concise summary — avoids a new dashboard while preserving immediate feedback; cost if wrong is a later UI expansion.
- [ ] Task 1: reward rules and persistence contract
- [ ] Task 2: transactional award service
- [ ] Task 3: answer feedback display
- Task 1: review failed — 2 Important findings: SQL must enforce `kind IN ('points','badge')`; add schema/migration regression coverage for the new table. Minor: pin exact badge payload in tests.
- Task 1: fix round 1/5 (3 addressed, 0 open; commits 4358f0b..20acdcf)
- Task 1: complete (commits 4358f0b..20acdcf, review clean)
- Task 2: review failed — Critical adaptive equation/estimate metadata is not passed into rewards; Important correction source key can mint repeated correction awards; Minor tests omit most acceptance cases.
- Task 2: fix round 1/5 (3 addressed, 0 open; commits 363c2b5..955efbd)
- Task 2: complete (commits 363c2b5..955efbd, review clean)
- Task 3: complete (commits 955efbd..e7d2bf9, review clean)
- Final review failed: 5 Important findings — missing `completed_early` completion reward; replay total boundary is unstable; corrected equation/estimate items excluded from badges; process rewards hidden on incorrect answers and zero-point summaries shown; Drizzle snapshot lacks the kind check. Three cross-flow regression cases remain Minor.
- Final fix round 1/1: 7 findings addressed; commit `69362d1`.
- Phase 3 Task 3: complete (commits `efc6176..69362d1`, final scoped re-review clean).
