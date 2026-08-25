## Status

Implemented optional reward feedback in `AnswerForm` and added a component regression test for points and new badge labels.

## Commit

`feat: show earned math rewards`

## Verification

- Red test: focused answer-form suite failed because `获得 2 分，累计 12 分。` was absent.
- Focused component tests: 32 passed.
- `npm run verify`: lint, typecheck, 367 tests (52 files), and production build passed.

## Concerns

Legacy results without `rewards` remain supported. No speed, rank, streak, leaderboard, or animation UI was added.
