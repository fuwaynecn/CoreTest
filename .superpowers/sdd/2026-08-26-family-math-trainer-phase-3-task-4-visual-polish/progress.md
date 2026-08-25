# SDD ledger — plan: docs/superpowers/plans/2026-08-26-family-math-trainer-phase-3-task-4-visual-polish.md

- Scope approved by user: visual refinement only; no new business logic, AI, PWA, deployment, or dashboard.
- Ruling: preserve the existing teal/sand visual language and make the four-stage rail the signature — it is already understood by the child flow, so refinement costs less than introducing a new visual metaphor; cost if wrong is a later palette refresh.

## Preflight conflict scan

| Row | Shared surface | Check | Result / ruling |
|---|---|---|---|
| Task 1 ↔ Task 2 | `web/src/app/globals.css` | Child and parent selectors share tokens and breakpoints. | Compatible: Task 1 establishes tokens and tablet defaults; Task 2 only tunes parent selectors and must not rename shared tokens. |
| Task 1 ↔ Task 3 | `web/src/app/globals.css` | Accessibility fixes may touch child styles. | Compatible: Task 3 may only make targeted focus, reduced-motion, or overflow fixes and must preserve Task 1 hooks. |
| Task 2 ↔ Task 3 | Parent CSS/E2E | Parent responsive behavior is verified after both passes. | Compatible: Task 3 is a verification/fix gate, not a second redesign. |
| Task 1 self-check | Child components/tests | Tests specify semantic hooks, not CSS snapshots. | Consistent: component props and reward/answer contracts remain unchanged. |
| Task 2 self-check | Parent page/components/tests | Assertions target landmarks/names; CSS changes target layout only. | Consistent: data loaders and text contracts remain unchanged. |
| Task 3 self-check | E2E/CSS | Full checks run after Tasks 1–2. | Consistent: no runtime interface is introduced. |

- [ ] Task 1: child tablet visual hierarchy
- [ ] Task 2: parent responsive information hierarchy
- [ ] Task 3: accessibility and visual regression gate
