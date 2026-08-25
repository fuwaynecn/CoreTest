# Task 3 report — accessibility and visual regression gate

## Changes

- Added focused Playwright assertions to `web/e2e/learning-state.spec.ts` using the existing independent scenario and browser projects.
- Child tablet coverage now checks named progress/question/feedback regions, keyboard-visible focus on the answer field, question → answer → scratchpad → stop-action order, reduced-motion timing, and horizontal overflow.
- Parent mobile coverage now checks the weekly report and first-attempt signal landmarks plus horizontal overflow.
- Parent mobile browser coverage now verifies the rendered dashboard geometry order: weekly report → signal metrics → plan → dosage → error → recent evidence → history → ability map.
- Reduced-motion duration parsing now handles both `ms` and `s` computed units.
- No CSS or semantic production changes were needed: the existing implementation satisfies the new gate.

## TDD evidence

- RED: the first focused run failed at the keyboard-focus assertion because tabbing from the answer field focused the intervening hint action rather than the answer control.
- GREEN: the assertion was corrected to exercise Shift+Tab from the hint action to the answer field; the focused tablet test then passed.

## Verification

- Focused tablet gate: passed (`1 passed`).
- Focused `tablet-webkit`: passed (1 test).
- Focused `tablet-chromium`: passed (1 test).
- Focused `parent-mobile`: 4 dependency tests passed; the target learning-state test failed before browser assertions with the pre-existing foreign-key cleanup error in `prepareIndependentScenario()` while deleting `attempts`.
- `npm run test:e2e`: 6 passed; 1 pre-existing parent-mobile fixture-cleanup failure. The command stops before the Chromium suite because `test:e2e:webkit` fails; fixture cleanup was not changed.
- `npm run verify`: passed lint, typecheck, 53 Vitest files / 375 tests, and production build.
- `npm run db:generate`: passed with “No schema changes, nothing to migrate”.
- `git diff --check`: passed.
