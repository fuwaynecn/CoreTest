# Task 1 Report

## Scope

Implemented only the Phase 4 Task 2 / Task 1 server-side AI runtime pieces:

- `web/src/services/ai/provider-client.ts`
- `web/src/services/ai/provider-client.test.ts`
- `web/src/services/ai/generate-ai-enhancement.ts`
- `web/src/services/ai/generate-ai-enhancement.test.ts`

No route, UI, quota, logging, retry, model switching, cost accounting, or monitoring work was added.

## What Changed

### `provider-client.ts`

- Added `AiChatMessage` contract for OpenAI-compatible chat messages.
- Added `callAiProvider()` with:
  - trailing-slash normalization on `baseUrl`
  - POST to `/chat/completions`
  - JSON body `{ model, messages, temperature: 0.2 }`
  - `content-type: application/json`
  - `Authorization: Bearer ...`
  - default 15,000ms timeout via `AbortController`
  - `finally` cleanup for the timeout handle
- Added typed safe provider errors for:
  - `timeout`
  - `network`
  - `http`
  - `invalid_response`
- Invalid response handling covers:
  - non-JSON responses
  - missing `choices`
  - empty `choices`
  - missing `message.content`
  - blank message content

### `generate-ai-enhancement.ts`

- Added `generateAiEnhancement()` to read the selected provider row from `aiProviderConfigs`.
- Preset fallback returns exact `fallbackText` for:
  - missing row
  - disabled row
  - missing encrypted key
  - decrypt failure
  - provider timeout/network/http/invalid-response failures
- Successful configured provider flow:
  - decrypts on server only
  - calls `callAiProvider()`
  - returns `{ source: "ai", text, provider, model }`
- No blocking throw escapes from `generateAiEnhancement()`.
- No logging or cross-provider fallback was added.

## TDD Notes

1. Added failing tests first for both new modules.
2. Ran:
   - `npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts`
3. Confirmed initial red state due to missing service files.
4. Implemented minimal runtime code.
5. Re-ran focused suites to green.
6. Ran regression-focused verification and typecheck.

## Verification

Ran successfully:

```powershell
Set-Location web
npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts
npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts src/domain/ai/provider-config.test.ts
npm run typecheck
```

Results:

- new runtime suites passed: 15 tests
- focused regression set passed: 21 tests
- typecheck passed

## Self-Review

- Checked diff scope: only `web/src/services/ai/*`
- Checked formatting with `git diff --check -- web/src/services/ai`
- Confirmed no secret values were written to code comments, report text, or assertions
- Confirmed provider errors stay typed and generic without response-body leakage

## Concerns

- HTTP errors are intentionally collapsed into a single `http` code without preserving response detail, matching the brief’s safe-error requirement.
- Invalid-response parsing only accepts the standard `choices[0].message.content` string shape; that is deliberate for this minimal runtime layer.

## Round 1 Fix

### Review Findings Addressed

1. Abort during `response.json()` body consumption is now classified as `timeout` instead of `invalid_response`.
2. Provider-client tests no longer commit a literal plaintext API-key test value or assert the full bearer token.

### TDD Cycle

1. Added a focused failing test for `AbortError` raised during body read after headers were received.
2. Confirmed the red state: the new test failed because the runtime mapped that abort to `invalid_response`.
3. Updated `provider-client.ts` so the `response.json()` catch maps `AbortError` to the existing safe `timeout` code.
4. Re-ran the focused runtime verification to green.

### Commands Run

```powershell
Set-Location web
npm test -- --run src/services/ai/provider-client.test.ts
npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts
npm run typecheck
```

### Output Summary

- `npm test -- --run src/services/ai/provider-client.test.ts`
  - passed: 10 tests
- `npm test -- --run src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts`
  - passed: 16 tests
- `npm run typecheck`
  - passed

### Files Updated In Round 1

- `web/src/services/ai/provider-client.ts`
- `web/src/services/ai/provider-client.test.ts`
