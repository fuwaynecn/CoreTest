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
