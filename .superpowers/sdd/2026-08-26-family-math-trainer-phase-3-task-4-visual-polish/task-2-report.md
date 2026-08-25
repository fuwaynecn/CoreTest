# Task 2 report — parent responsive information hierarchy

## Changes

- Added a named `家长训练概览` region around the parent dashboard flow.
- Added mobile-only visual ordering: weekly report, current signal metrics, plan, dosage, then historical evidence.
- Added an accessible label for the seven-day plan calendar.
- Preserved all existing data loading, props, calculations, API calls, and copy.

## TDD

- Added the named-region assertion in `web/src/app/parent/page.test.tsx`.
- Confirmed it failed before the markup change.
- Focused suite passes: 5 files, 13 tests.

## Verification

- `npm run verify`: passed lint, typecheck, 53 test files / 375 tests, and production build.
- `npx playwright test --project=parent-mobile`: 6 passed; the final shared `@tablet @parent` scenario failed during fixture cleanup with an existing SQLite foreign-key error while deleting attempts. The earlier tablet run of that scenario passed and confirmed no horizontal overflow.

## Round 1 fixes

- Converted `家长训练概览` from `display: contents` to a real block/grid section.
- Moved diagnosis history and the ability map into the ordered dashboard flow after actionable and recent evidence content.
- Reordered the flow markup to weekly report, signal metrics, plan, dosage, error summary, recent evidence, diagnosis history, then ability map; mobile order assertions now cover the first three landmarks.
- Focused suite after fixes: 5 files, 13 tests passed.

## Round 2 fixes

- Added an explicit mobile `order` for every direct dashboard-flow child: weekly 1, signal 2, plan 3, dosage 4, errors 5, recent evidence 6, diagnosis history 7, and ability map 8.
- Added the `recentEvidenceSection` hook and asserted the complete direct-child sequence in the parent page test.
- Focused suite: 5 files, 13 tests passed; `npm run verify`: passed all 375 tests and the production build.

## Round 3 fixes

- Seeded one minimal in-progress diagnosis record in the parent page test so the optional diagnosis-history child renders.
- Extended the direct-child order assertion to cover weekly, signal, plan, dosage, errors, recent evidence, diagnosis history, and AbilityMap.
- No production code changes were needed; focused tests remained 13/13 and `npm run verify` passed all 375 tests plus the production build.
