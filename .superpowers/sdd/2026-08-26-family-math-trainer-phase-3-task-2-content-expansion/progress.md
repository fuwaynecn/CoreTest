# SDD ledger — plan: docs/superpowers/plans/2026-08-26-family-math-trainer-phase-3-task-2-content-expansion.md

## Preflight

| Scope | Shared files/interfaces | Check |
|---|---|---|
| Task 1 | `phase2-catalog.ts` produces `phase2Catalog`; `phase2-catalog.test.ts` consumes it | Tests will assert the expanded IDs and domain quotas before catalog entries are added. |
| Task 1 | `reviewed` / `validateCatalog` | Reuse existing helper and formal validator; no new stem family is introduced. |

| Task | Internal consistency |
|---|---|
| Task 1 | Test counts and implementation allocation both target 48 additions and 120 total templates. |

Task 1: complete (commits 360dd72..e7bf983, review clean).

- Added 48 catalog templates; final total is 120.
- Domain totals: number 23, equation 25, geometry 18, data 15, application 23, thinking 16.
- Content tiers remain core 95, regional 18, transition 7.
- Focused catalog test, stale seed/diagnosis expectations, and `npm run verify` now all pass against the 120-template catalog.
- `git diff --check` passed; Git only reports LF-to-CRLF normalization warnings for the touched test files.
- Final verification details are documented in `task-1-report.md`.

Repair round 1: complete. Coverage and whole-package allocation findings resolved; focused and full verification pass.

Repair round 1 follow-up: corrected `app-price-03` to difficulty L1, completing the L1 application scaffold and exact L1/L2 allocation of 6/12.
