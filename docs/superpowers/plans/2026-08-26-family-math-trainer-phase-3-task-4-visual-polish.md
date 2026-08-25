# Family Math Trainer Phase 3 Task 4 Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing child tablet and parent responsive interfaces so the six-week training loop is easier to scan, touch, and understand without changing domain behavior.

**Architecture:** Keep the current pages and component contracts. Consolidate visual decisions in `globals.css`, add only semantic class hooks where the existing markup needs hierarchy, and verify the highest-value child/parent flows at tablet and mobile widths. The signature is a quiet four-stage progress rail: the day's sequence remains visible without turning the experience into a game dashboard.

**Tech Stack:** Next.js/React, CSS, Vitest/Testing Library, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-08-19-family-math-training-web-design.md` (sections 2, 12, 13, 14, 20); `docs/superpowers/specs/2026-08-20-family-math-trainer-phase-2-design.md` (Phase 3 visual refinement scope).

## Global Constraints

- Child experience is tablet-first, landscape-friendly, large-type, large-target, and single-task.
- Parent experience must remain usable at phone and desktop widths.
- Process feedback stays encouraging and concrete; do not add ranking, speed pressure, decorative gamification, or new business rules.
- Preserve existing API, session, answer, reward, and accessibility semantics.
- Reuse the existing palette and CSS-only layout/motion; do not add a UI library or dependency.
- Respect `prefers-reduced-motion`, visible keyboard focus, and no horizontal overflow.

---

### Task 1: Child tablet visual hierarchy

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/components/question-card.tsx`
- Modify: `web/src/components/training-segments.tsx`
- Modify: `web/src/components/answer-form.tsx`
- Modify: `web/src/components/reading-card.tsx`
- Modify: `web/src/components/scratchpad.tsx`
- Test: existing child component tests plus a focused visual-contract test if a new semantic hook is added

**Interfaces:**
- Consumes current component props and result contracts unchanged.
- Produces a visually grouped child session: compact header/progress, readable question card, obvious answer action, calm feedback, and touch-safe secondary actions.

- [ ] **Step 1: Write failing component assertions**

  Add assertions for stable semantic hooks/labels only where needed: the progress rail remains labelled, the question card exposes its reading cue, and reward/correction feedback remains discoverable after submit. Do not snapshot raw CSS.

- [ ] **Step 2: Run focused tests and confirm the new assertions fail**

  Run `npm run test:run -- src/components/question-card.test.tsx src/components/training-segments.test.tsx src/components/answer-form.test.tsx src/components/reading-card.test.tsx src/components/scratchpad.test.tsx` from `web`.

- [ ] **Step 3: Implement the visual pass**

  Use a small token layer (surface, muted text, border, accent, success, caution) and CSS grid/flex. Keep the signature four-stage rail; improve active/completed/disabled contrast, card spacing, input height, and feedback grouping. Add no new state or data fetching.

- [ ] **Step 4: Run focused tests and inspect at tablet widths**

  Run the focused command and use the existing Playwright tablet projects or browser tooling to check 1024×768 landscape and 768×1024 portrait for overflow and target reachability.

- [ ] **Step 5: Commit**

  `git add web/src/app/globals.css web/src/components && git commit -m "feat: polish child tablet training UI"`

### Task 2: Parent responsive information hierarchy

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/parent/page.tsx` only if semantic grouping needs a class hook
- Modify: `web/src/components/ability-map.tsx`
- Modify: `web/src/components/dosage-summary.tsx`
- Modify: `web/src/components/error-summary.tsx`
- Modify: `web/src/components/plan-calendar.tsx`
- Modify: `web/src/components/weekly-report.tsx`
- Test: existing parent/page/component tests

**Interfaces:**
- Consumes current parent data and component props unchanged.
- Produces a phone-readable hierarchy: recommendation and weekly signal first, evidence cards readable without horizontal scrolling, and actions clearly separated from historical detail.

- [ ] **Step 1: Write failing responsive-contract assertions**

  Add assertions for semantic headings/landmarks and accessible names only where a class hook or grouping is required; keep data and text contracts unchanged.

- [ ] **Step 2: Run the parent-focused tests and confirm the new assertions fail**

  Run `npm run test:run -- src/app/parent/page.test.tsx src/components/ability-map.test.tsx src/components/dosage-summary.test.tsx src/components/error-summary.test.tsx src/components/plan-preferences-form.test.tsx`.

- [ ] **Step 3: Implement the responsive pass**

  Tune the existing grid breakpoints, card density, table-to-card behavior, heading rhythm, and action emphasis. Keep content order meaningful and avoid adding charts or decorative illustrations.

- [ ] **Step 4: Run tests and mobile-width checks**

  Run the focused command and the existing parent-mobile Playwright project; verify no horizontal overflow at 390px and 768px widths.

- [ ] **Step 5: Commit**

  `git add web/src/app/globals.css web/src/app/parent/page.tsx web/src/components && git commit -m "feat: refine parent responsive dashboard"`

### Task 3: Accessibility and visual regression gate

**Files:**
- Modify: `web/src/app/globals.css` only for reduced-motion/focus/overflow fixes found by the checks
- Modify: relevant existing Playwright specs under `web/e2e/` or component tests
- Create: `.superpowers/sdd/2026-08-26-family-math-trainer-phase-3-task-4-visual-polish/task-3-report.md`

**Interfaces:**
- Consumes the completed child and parent visual passes.
- Produces a clean verification record; no new runtime interface.

- [ ] **Step 1: Write failing regression checks**

  Cover child tablet session, child feedback/stop state, parent mobile dashboard, keyboard focus visibility, and horizontal-overflow absence at the existing project viewports.

- [ ] **Step 2: Run the checks and record failures**

  Run `npm run test:e2e` from `web` with the existing seed/setup; failures must identify layout/accessibility regressions rather than environment setup.

- [ ] **Step 3: Make only targeted CSS/semantic fixes**

  Add `prefers-reduced-motion` handling, preserve `:focus-visible`, and fix any measured overflow or clipped text without redesigning the data model.

- [ ] **Step 4: Run full verification**

  Run `npm run verify`, `npm run test:e2e`, `npm run db:generate`, and `git diff --check`.

- [ ] **Step 5: Commit**

  `git add web && git commit -m "test: verify phase three visual polish"`

## Self-review checklist

- [ ] Child tablet remains the primary visual target and all touch targets remain at least 44–48px.
- [ ] Parent mobile has no horizontal overflow and preserves content order.
- [ ] Existing reward, correction, reading-card, scratchpad, and stop-session behavior is unchanged.
- [ ] No speed/rank/leaderboard or decorative animation was added.
- [ ] `npm run verify`, E2E, database no-op generation, and diff check pass.
