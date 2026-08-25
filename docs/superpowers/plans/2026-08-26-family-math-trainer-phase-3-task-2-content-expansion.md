# Phase 3 Task 2 Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the reviewed Phase 2 question catalog from 72 to 120 original templates while preserving deterministic instantiation and formal answer validation.

**Architecture:** Keep the existing `catalogInputs` and `reviewed` pipeline. Add 48 entries using the existing validated stem families so no new runtime or validator abstraction is needed; extend catalog tests with exact IDs, domain quotas, and deterministic validation coverage.

**Tech Stack:** TypeScript, Vitest, Zod, existing question-template validator.

**Spec:** `docs/superpowers/plans/2026-08-26-family-math-trainer-phase-3-task-1-content-audit.md`

## Global Constraints

- The catalog grows from 72 to exactly 120 Phase 2 templates.
- Add exactly 48 templates: number +7, equation +7, geometry +10, data +9, application +9, thinking +6.
- New prompts are original and owned (`source: "original"`, `licenseStatus: "owned"` through the existing helper).
- Reuse the existing formal stem families and answer proof rules; `validateCatalog(phase2Catalog)` must remain empty.
- Preserve deterministic same-seed instantiation and tablet-readable reading metadata.

---

### Task 1: Expand the catalog and lock the blueprint

**Files:**
- Modify: `web/src/content/phase2-catalog.test.ts`
- Modify: `web/src/content/phase2-catalog.ts`
- Create: `.superpowers/sdd/2026-08-26-family-math-trainer-phase-3-task-2-content-expansion/progress.md`

**Interfaces:**
- Consumes: existing `TemplateInput`, `reviewed`, `phase2Catalog`, `validateCatalog`, and `instantiateTemplate` contracts.
- Produces: 120 deterministic reviewed templates with exact per-domain allocation.

- [ ] **Step 1: Write the failing blueprint assertions**

  Extend the catalog test's expected IDs and counts to 120 entries, with domain counts of number 23, equation 25, geometry 18, data 15, application 23, thinking 16. Keep the existing validator and deterministic-variant assertions active.

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run `npm run test:run -- src/content/phase2-catalog.test.ts` from `web/` and confirm it fails because the current catalog still has 72 entries.

- [ ] **Step 3: Add the 48 minimal catalog entries**

  Append seven number, seven equation, ten geometry, nine data, nine application, and six thinking templates. Use supported existing stem patterns and calculate each `answer`/choice from the rendered prompt. Mark longer regional/transition entries through the existing ID sets only when the new prompt carries the corresponding reading load.

- [ ] **Step 4: Run the focused tests and full verification**

  Run `npm run test:run -- src/content/phase2-catalog.test.ts`, then `npm run verify`, and `git diff --check`.

- [ ] **Step 5: Record the completion evidence**

  Update the SDD progress ledger with the exact counts, test commands, and commit hash; commit the catalog, tests, plan, and ledger together.