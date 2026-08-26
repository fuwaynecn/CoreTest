# Task 2 Report

Date: 2026-08-26

Scope:
- Added `web/src/services/parent/ai-provider-config.ts`
- Added `web/src/app/api/parent/ai-config/route.ts`
- Added `web/src/app/api/parent/ai-config/route.test.ts`

TDD record:
1. Wrote the required route tests first with the exact cases from the brief.
2. Ran `npm test -- --run src/app/api/parent/ai-config/route.test.ts` before implementation.
3. Observed the expected red failure: `Failed to resolve import "./route"` because the route file did not exist yet.
4. Implemented the minimal service and route needed to satisfy the tests.
5. Re-ran the focused route test until green.

Implementation summary:
- `listAiProviderConfigs(db)` returns both supported providers in `AI_PROVIDERS` order and synthesizes empty views for missing rows.
- The view never decrypts or exposes stored key material; it reports only `hasApiKey`, `apiKeyMasked`, and metadata.
- `saveAiProviderConfig(db, input)` upserts a provider row, encrypts replacement keys, retains the existing encrypted key when `apiKey` is omitted, and clears it only when `clearApiKey` is true.
- `GET /api/parent/ai-config` and `POST /api/parent/ai-config` enforce parent-only access through `getCurrentUser()` first.
- POST uses strict request validation, rejects conflicting `apiKey` plus `clearApiKey`, maps invalid input to the required 400 payload, and maps missing/short `AI_CONFIG_ENCRYPTION_KEY` to the required safe 503 payload.

Verification:
- `npm test -- --run src/app/api/parent/ai-config/route.test.ts`
  - Passed: 5 tests
- `npm test -- --run src/app/api/parent/ai-config/route.test.ts src/domain/ai/provider-config.test.ts`
  - Passed: 11 tests across 2 files
- `npm run typecheck`
  - Passed

Self-review:
- Confirmed the diff is limited to the requested service, parent route, and route tests.
- Confirmed the responses never include plaintext API keys or encrypted ciphertext.
- Confirmed GET does not depend on the encryption secret because it never decrypts.

Commit:
- Created after fresh test and typecheck verification.

Concerns:
- None.

## Round 1 Fix

Date: 2026-08-26

Scope:
- Updated `web/src/services/parent/ai-provider-config.ts`
- Updated `web/src/app/api/parent/ai-config/route.test.ts`

TDD record:
1. Strengthened the route tests first to seed a real encrypted stored value and assert GET plus retain-only POST return a safe configured mask instead of anything derived from storage.
2. Added auth assertions for the exact required 401 and 403 JSON bodies.
3. Ran `npm test -- --run src/app/api/parent/ai-config/route.test.ts` before the code fix.
4. Observed the expected red failure: stored-key responses were returning a mask derived from encrypted storage rather than a fixed configured marker.
5. Changed the service view logic so stored keys use a fixed non-secret configured mask, while same-request plaintext replacements still use `maskApiKey`.
6. Fixed the resulting nullability issue caught by typecheck and re-ran verification.

Implementation summary:
- Stored keys now render as the fixed non-secret mask `••••••已配置`.
- The service still never decrypts for GET or retain-only POST responses.
- Plaintext replacement keys are masked only from the current request value, not from persisted ciphertext.
- Route tests now seed a real encrypted stored value and verify responses do not contain stored encrypted material.

Verification:
- `npm test -- --run src/app/api/parent/ai-config/route.test.ts`
  - First run before the fix failed in 2 tests because stored-key masks were derived from encrypted storage.
  - Re-run after the fix passed: 5 tests
- `npm test -- --run src/app/api/parent/ai-config/route.test.ts src/domain/ai/provider-config.test.ts`
  - Passed: 11 tests across 2 files
- `npm run typecheck`
  - First run failed on a `string | null` argument passed to `maskApiKey`
  - Re-run after the nullability fix passed

Self-review:
- Confirmed no response path derives `apiKeyMasked` from persisted ciphertext.
- Confirmed the tests check exact auth bodies as required.
- Confirmed the patch stayed scoped to the service, route tests, and report.

Commit:
- Created after fresh tests and typecheck verification.

Concerns:
- None.
