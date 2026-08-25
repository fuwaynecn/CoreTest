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
- Task 1: review failed — Important: session markup puts scratchpad before answer form; Important: new rail state mapping lacks behavioral test coverage; Minor: seed timeout was not reproduced by reviewer.
- Task 1: fix round 1/5 (3 addressed, 0 open; commits dc6a945..228bfa5)
- Task 1: complete (commits dc6a945..228bfa5, review clean)
- Task 2: review failed — Important: AbilityMap/diagnosis history remain before the mobile reordered stack; Important: `display: contents` makes the landmark unreliable; Minor/scope: report committed at repository root instead of the task ledger directory.
- Task 2: fix round 1/5 — re-review found the mobile grid still shared order 5 for ErrorSummary and recent evidence; explicit order remains open.
- Task 2: fix round 2/5 — implementation order is explicit, but the full-sequence test omitted the optional diagnosis-history direct child.
- Task 2: fix round 3/5 (1 addressed, 0 open; commits 1bc0cbc..66b9eee)
- Task 2: complete (commits 89b5d41..66b9eee, review clean)
- Task 3: review failed — Critical: browser E2E does not assert parent mobile order; Important: report overstates E2E status because tablet-chromium/parent-mobile hit the known FK cleanup failure; Minor: reduced-motion check is browser-sensitive.
- Task 3: fix round 1/5 (3 addressed, 0 open; commits 0c69775..fab8c20)
- Task 3: complete (commits 0c69775..fab8c20, review clean)
- Final review failed: Important aggregate E2E gate remains red because the shared fixture cleanup does not delete reward events that reference attempts; isolated UI assertions pass.
- Ruling: update only the learning-state E2E fixture cleanup to delete this task's child reward events before attempts — the FK failure is caused by the Task 3 reward ledger, so leaving it red would invalidate the new visual gate; cost if wrong is a small test-fixture change that can be reverted without runtime impact.
- Final fix round 1/1: aggregate E2E cleanup corrected in `a92ae4e`; final scoped re-review clean.
- Phase 3 Task 4: complete (commits `f209d60..a92ae4e`, final review clean).
