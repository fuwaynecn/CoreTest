# Family Math Trainer Phase 2 Delivery Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each linked plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Phase 2 deterministic learning engine through three independently reviewable increments without breaking the merged Phase 1 learning loop.

**Architecture:** Phase 2 is split at stable product boundaries. Phase 2A produces a usable, resumable three-part diagnosis and reviewed content foundation; Phase 2B turns attempts into explainable mastery, error, review, and dosage state; Phase 2C consumes those states to create six-week plans, adaptive daily sessions, and complete child/parent experiences.

**Tech Stack:** Node.js 24, Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5, SQLite, Drizzle ORM 1.0.0-rc.4, Zod 4.4.3, Vitest 3.2.7, Testing Library, Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-20-family-math-trainer-phase-2-design.md`

## Global Constraints

- Read `web/AGENTS.md` and the relevant guides under `web/node_modules/next/dist/docs/` before changing Next.js application code.
- Preserve Phase 1 authentication, immutable question snapshots, first-attempt evidence semantics, transaction boundaries, and submission idempotency.
- All learning-day, week, and due-date calculations use `Asia/Shanghai`; weeks start on Monday.
- Scoring, diagnosis, mastery, review, dosage, and scheduling are deterministic and never call AI.
- The complete application works without an OpenAI or DeepSeek API key.
- Accuracy and independent recall take precedence over speed; do not add rankings or speed rewards.
- Client input cannot set scoring results, mastery state, review level, dosage level, or scheduling ratios.
- Templates and generated variants used for diagnosis or mastery must pass deterministic answer validation before activation.
- Existing populated Phase 1 databases must migrate without losing users, sessions, attempts, immutable snapshots, or constraints.
- Keep the Phase 1 single-instance persistent SQLite deployment boundary.
- Use test-driven development: observe the specified focused test fail, implement the minimum behavior, then run it green before committing.
- Do not weaken TLS, cookie security, role boundaries, data isolation, or the documented Chrome/WebKit acceptance matrix.

---

## Delivery Order

### Increment 2A — Diagnosis and reviewed content foundation

Plan: `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2a-diagnosis.md`

Produces:

- Phase 2 schema foundation and safe populated-database migration.
- Shared Shanghai calendar and learning-domain contracts.
- Validated 72-template catalog and deterministic safe variants.
- Three resumable 15-slot diagnosis parts with deterministic difficulty movement.
- Child diagnosis UI and parent diagnosis-progress/report UI.

Acceptance boundary: a new or migrated child can complete, pause, resume, and version a full diagnosis; Phase 1 historical sessions remain readable, while new formal daily sessions require completed diagnosis.

### Increment 2B — Evidence, mastery, review, and dosage

Plan: `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2b-learning-state.md`

Consumes the completed 2A contracts and produces:

- Attempt telemetry, hint evidence, correction sequence, and immutable mastery evidence.
- System/child/parent error-cause chain.
- Five-state mastery derivation.
- 1/3/7/14/30-day review schedules.
- Seven-level computation and six-level equation dosage.
- Parent ability-map, error, review, and dosage read models.

Acceptance boundary: the same immutable evidence can recompute the same mastery, review, and dosage results, and every displayed state has traceable supporting attempts.

### Increment 2C — Six-week planning and adaptive experiences

Plan: `docs/superpowers/plans/2026-08-20-family-math-trainer-phase-2c-adaptive-planning.md`

Consumes completed 2A and 2B contracts and produces:

- Versioned six-week plans and parent preferences.
- Deterministic daily scheduling with 45/25/20/10 targets and safe shortage fallback.
- Full four-part child training with scratchpad, reading card, hints, correction, reflection, and recovery.
- Parent future-week plan, specialist controls, weekly report, and evidence drill-down.
- Full migration and WebKit/Chrome acceptance coverage.

Acceptance boundary: a diagnosed child receives a reasoned six-week plan and adaptive daily tasks; the parent can understand and revise future scheduling preferences without rewriting historical learning state.

## Cross-Increment Interface Freeze

The following public types are introduced in 2A and may only be changed by an explicit migration plus updates to every later plan:

```ts
export type LearningDomain =
  | "number_operations"
  | "equation_algebra"
  | "geometry_space"
  | "data_statistics"
  | "application_modeling"
  | "thinking_habits";

export type ContentTier = "core" | "regional" | "transition";
export type SessionKind = "diagnostic" | "practice" | "daily" | "review" | "assessment";
export type MasteryStatus = "undiagnosed" | "needs_support" | "learning" | "basic" | "stable";
export type ErrorCause =
  | "missing_unit"
  | "copied_number"
  | "calculation"
  | "relationship"
  | "range_check"
  | "incomplete_reading"
  | "unknown";
```

## Program Verification

After every increment:

```powershell
cd web
npm run verify
npm run test:e2e
git diff --check master...HEAD
```

Expected: lint, typecheck, all Vitest files, production build, two WebKit scenarios, and the stable-Chrome tablet scenario exit `0`; the diff check prints no errors.

Before declaring all of Phase 2 complete, also run the Phase 1 browser flow unchanged and the new cross-increment six-week flow from a newly seeded database and from a migrated populated Phase 1 database.

## Spec Coverage Self-Review

| Design section | Owning plan/task |
| --- | --- |
| Goals, success criteria, scope, architecture | Roadmap constraints and all increment completion gates |
| Initial diagnosis | 2A Tasks 4–6 |
| Ability model and immutable evidence | 2B Tasks 1 and 4 |
| 1/3/7/14/30-day review | 2B Task 5 |
| Computation and equation dosage | 2B Task 5 |
| Three-layer error causes | 2B Task 3 |
| Daily scheduling and six-week plans | 2C Tasks 2 and 3 |
| Reviewed catalog and safe variants | 2A Task 3 |
| Child experience and recovery | 2A Task 6; 2B Tasks 2–3; 2C Task 4 |
| Parent ability, error, plan, and report views | 2A Task 6; 2B Task 6; 2C Task 5 |
| Data-model evolution and legacy migration | Schema Task 1/2 in each increment; 2C Task 6 |
| Service boundaries, transactions, and errors | 2A Task 5; 2B Tasks 2–5; 2C Tasks 2–5 |
| Rule, service, component, and browser testing | Every task plus 2C Task 6 |
| Final completion gate | 2C program completion gate |

Self-review result: every Phase 2 design section has an owning task; public type names are frozen above and used consistently by later plans; no implementation placeholders remain.
