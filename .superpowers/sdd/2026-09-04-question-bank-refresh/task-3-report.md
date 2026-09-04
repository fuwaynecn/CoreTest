# Task 3 report

## Implemented

- Daily scheduling now consumes active `questionInstances` joined to their source templates and skills.
- Candidate ordering preserves due-review priority, mastery/difficulty ordering, structure and review caps, and adds least-recently-used instance ordering (`null` first, then instance ID).
- Full weekly refresh and missing-skill scoped refresh run before the immediate session transaction; refresh failures fall back to existing active inventory.
- Session items snapshot the selected persistent instance, retain source-template metadata, and update selected instances' `lastUsedAt` in the same immediate transaction.
- Existing same-day adaptive sessions are reused before refresh; diagnostic/template flows remain unchanged.
- Dashboard dry-run previews now read active persistent instances without triggering refresh, so shortages are visible instead of being filled from templates.

## Verification

- Focused scheduling/training tests: 46 passed.
- Review fix focused tests: 14 passed.
- Full single-worker suite: 66 files, 470 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
