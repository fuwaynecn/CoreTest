# Task 2 Report

## Scope

- Added parent-only `POST /api/parent/ai-test` route with strict `{ provider }` validation.
- Added provider-local test buttons to the AI config form without changing existing save/replace/clear request payloads.
- Added route and form tests for safe request/response behavior and local pending state.

## TDD

1. Added failing route tests for parent auth, strict payload validation, safe success body, and safe 502 fallback behavior.
2. Added failing form tests for provider-only POST payloads, safe success/failure messages, and active-button-only pending state.
3. Implemented the route and form changes to satisfy those tests.
4. Re-ran the focused tests until green and removed the React `act(...)` warning from the pending-state test.

## Verification

- `npm test -- --run src/app/api/parent/ai-test/route.test.ts src/components/ai-provider-config-form.test.tsx`
  - Passed.
- `npm test -- --run src/app/api/parent/ai-test/route.test.ts src/components/ai-provider-config-form.test.tsx src/services/ai/provider-client.test.ts src/services/ai/generate-ai-enhancement.test.ts`
  - Passed.
- `npm run lint`
  - Passed.
- `npm run typecheck`
  - Passed.
- `npm run test:run`
  - Failed in pre-existing `src/db/seed.test.ts` timeout:
    - `seeds 120 reviewed templates plus the stable three-question Phase 1 daily pool idempotently`
    - Vitest timeout: 5000ms.
- `npm run build`
  - Passed.
- `npm run db:generate`
  - Passed with `No schema changes, nothing to migrate`.
- `git diff --check`
  - Passed; emitted LF/CRLF normalization warnings on the edited form files only.

## Self-review

- Route authenticates before parsing JSON.
- Route only accepts `openai` or `deepseek`, rejects invalid JSON and unknown fields with the required 400 body.
- Route always uses fixed harmless test messages and fixed fallback text.
- Route never returns generated text, error codes, API keys, base URLs, or request prompt content.
- Form test action only posts `{ provider }`.
- Form failure UI stays generic and does not surface backend error details.
- Save flow remains on `/api/parent/ai-config`; test flow is isolated to `/api/parent/ai-test`.

## Files Changed

- `web/src/app/api/parent/ai-test/route.ts`
- `web/src/app/api/parent/ai-test/route.test.ts`
- `web/src/components/ai-provider-config-form.tsx`
- `web/src/components/ai-provider-config-form.test.tsx`

## 2026-08-26 Fix Wave

### Scope

- Replaced the misleading parent-facing copy so the page no longer claims no external AI calls happen.
- Tightened the provider auth regression test to assert the exact bearer header from an opaque runtime token variable.
- Added minimal `.aiProviderActions` layout CSS so save/test buttons wrap with a visible gap while preserving the existing 48px button height floor.

### Verification

- `npm test -- --run src/components/ai-provider-config-form.test.tsx src/services/ai/provider-client.test.ts`
  - Passed.
- `npm run lint`
  - Passed.
- `npm run typecheck`
  - Passed.

### Notes

- No secrets or ciphertext were added to source or test assertions.
- This fix wave did not re-run the broader suite; the earlier recorded pre-existing `src/db/seed.test.ts` timeout remains the only known full-suite concern from Task 2 work.
