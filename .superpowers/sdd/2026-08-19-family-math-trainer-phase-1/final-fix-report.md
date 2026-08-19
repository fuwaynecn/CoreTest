# Phase 1 final-fix report

## Scope and commit

- Base: `3893939f63f2470724230d6c98a47383d8438754` (`3893939`)
- Branch: `feature/math-trainer-phase-1`
- Commit subject: `fix: complete phase 1 pre-merge fixes`
- Commit policy: all implementation, migration, tests, documentation, and this report are included in one commit. The final hash is reported in the handoff; a commit cannot contain its own final hash because changing this file would change that hash.

## Implementation

### Immutable question snapshots

- Added required `session_items` snapshot columns for stem, answer specification, explanation, skill ID, and skill name.
- New daily sessions copy all snapshot values in the same transaction that creates their items.
- Session views, scoring, mastery attribution, returned explanations, and recent parent evidence now read session-item snapshots rather than mutable templates.
- Added a regression proving a post-creation template edit cannot change the session stem, scoring, explanation, mastery skill, or historical evidence.

### Evidence semantics

- Parent evidence orders submissions deterministically and selects the earliest submission per session item for accuracy metrics.
- Added separate cumulative, Asia/Shanghai-today, and Monday-start current-week first-attempt metrics.
- Recent evidence still contains every submission (up to the existing 20-row display limit), including corrections.
- The weekly recommendation now reads only current-week first-attempt evidence.
- The accepted four-submission flow reports 2 correct first attempts out of 3 while retaining both `7.5` and `7.5 元`.

### Authentication, credentials, metadata, and cleanup

- Attempt API authentication now returns JSON `401` for no session and JSON `403` for a non-child session; it no longer invokes page redirect behavior.
- Added form coverage proving an expired-session JSON response unlocks editing and does not reuse the failed submission ID.
- Login and both seed entry points share the same 4–128 character credential schema.
- Added a process-level seed regression proving invalid credentials fail before the SQLite file is created or migrations/writes begin.
- Set document language to `zh-CN`, replaced scaffold metadata, and deleted unused `src/app/page.module.css`.

### Reproducible setup documentation

- Replaced the scaffold README with Node 24/npm setup, `npm ci`, environment variables, migration/seed procedure, verification commands, WebKit installation, and the stable Google Chrome requirement for `channel: "chrome"`.
- Documented local/CI browser verification, production HTTPS/Secure-cookie behavior, and the persistent single-instance SQLite boundary.
- Removed the generic Vercel recommendation and explicitly marked ephemeral/serverless and multi-instance storage as unsupported in Phase 1.

## Migration

- Added `web/drizzle/20260819172252_opposite_rumiko_fujikawa/` with generated snapshot metadata and a populated-database-safe SQL migration.
- The SQL migration copies attempts to a transaction-local backup table, removes the child table before rebuilding `session_items`, backfills snapshots from `question_templates` and `skills`, recreates `attempts`, and restores every attempt.
- This order avoids dropping a referenced parent table while foreign keys are enabled.
- Regression coverage starts from both pre-snapshot migrations with populated `session_items` and `attempts`, then verifies the backfill, retained attempt, session/template/skill foreign keys, session-item primary key, and attempt submission uniqueness.

## Files

- Database and migration: `web/src/db/schema.ts`, `web/src/db/schema.test.ts`, `web/src/db/seed.ts`, `web/src/db/seed.test.ts`, `web/drizzle/20260819172252_opposite_rumiko_fujikawa/migration.sql`, `web/drizzle/20260819172252_opposite_rumiko_fujikawa/snapshot.json`.
- Training and evidence: `web/src/services/training/create-daily-session.ts`, `web/src/services/training/submit-attempt.ts`, `web/src/services/training/get-parent-evidence.ts`, `web/src/services/training/training-service.test.ts`, `web/src/services/training/get-parent-evidence.test.ts`.
- Parent UI and acceptance: `web/src/app/parent/page.tsx`, `web/src/app/parent/page.test.tsx`, `web/src/app/globals.css`, `web/e2e/learning-loop.spec.ts`.
- Authentication and credentials: `web/src/app/api/child/attempts/route.ts`, `web/src/app/api/child/attempts/route.test.ts`, `web/src/components/answer-form.test.tsx`, `web/src/domain/auth/credentials.ts`, `web/src/domain/auth/credentials.test.ts`, `web/src/app/api/auth/login/route.ts`, `web/scripts/seed-e2e.ts`.
- Runtime/documentation: `web/README.md`, `web/.env.example`, `web/src/app/layout.tsx`; deleted `web/src/app/page.module.css`.
- Report: `.superpowers/sdd/2026-08-19-family-math-trainer-phase-1/final-fix-report.md`.

## Exact verification results

### Focused migration, training, evidence, auth/API, seed, and component tests

Command:

```powershell
npx vitest run src/db/schema.test.ts src/services/training/training-service.test.ts src/services/training/get-parent-evidence.test.ts src/app/parent/page.test.tsx src/app/api/child/attempts/route.test.ts src/components/answer-form.test.tsx src/domain/auth/credentials.test.ts src/db/seed.test.ts src/app/api/auth/auth-routes.test.ts src/lib/auth/current-user.test.ts
```

Result: exit `0`; `10` test files passed, `49` tests passed, `0` failed (Vitest duration `13.13s`).

### Full project verification

Command:

```powershell
npm run verify
```

Result: exit `0`.

- ESLint: passed with no warnings or errors.
- TypeScript: `tsc --noEmit` passed.
- Vitest: `14` test files passed, `56` tests passed, `0` failed (duration `16.86s`).
- Next.js 16.3.1 production build: compiled successfully; TypeScript, page-data collection, and all `10/10` static-page generation steps completed.

### Full browser verification

Command:

```powershell
npm run test:e2e
```

Result: exit `0`.

- WebKit dependency flow: `tablet-webkit` child test and `parent-mobile` evidence test both passed (`2 passed`, `1.1m`).
- Stable Google Chrome flow: `tablet-chromium` with `channel: "chrome"` passed (`1 passed`, `15.0s`).
- The runner emitted environment-only notices that `NO_COLOR` was ignored because `FORCE_COLOR` was set; there were no browser-test failures.

### Whitespace

Command:

```powershell
git diff --check
```

Result: exit `0`; no whitespace errors. Git on this Windows checkout emitted LF-to-CRLF conversion notices only; no repository or global line-ending configuration was changed.

## Self-review

- Traced every mutable template read used by in-progress or historical behavior and replaced only the scoring/evidence/session-view reads required by the brief.
- Reviewed the migration against populated SQLite foreign-key behavior; the migration preserves data and constraints without disabling foreign keys or weakening transactional safety.
- Checked the evidence calculation against the exact accepted flow and explicit Shanghai midnight/Monday boundaries.
- Confirmed corrections remain in the recent table while only first submissions affect accuracy and recommendations.
- Confirmed API failures remain JSON and the client treats the `401` as a permanent editable failure rather than a malformed retry.
- Confirmed seed length validation runs before hashing, database creation, migration, or writes and remains identical to login validation through one shared schema.
- Confirmed no TLS setting, persistent global configuration, unrelated refactor, or reviewed child-flow behavior was changed.

## Concerns

- No unresolved functional concerns.
- Phase 1 deliberately remains limited to one long-running application instance with persistent local SQLite; the README now makes that deployment constraint explicit.
- Playwright's `NO_COLOR`/`FORCE_COLOR` notices come from the invoking environment and do not affect results.
