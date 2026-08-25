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

