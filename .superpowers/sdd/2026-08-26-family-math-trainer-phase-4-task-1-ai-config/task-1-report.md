# Phase 4 Task 1 Report

## Scope completed

- Added AI provider domain primitives under `web/src/domain/ai/`:
  - `provider-config-crypto.ts`
  - `provider-config.ts`
  - `provider-config.test.ts`
- Extended `web/src/db/schema.ts` with the new `aiProviderConfigs` table.
- Extended `web/src/db/schema.test.ts` with a migration-compatibility test for the new table.
- Generated a new Drizzle migration directory:
  - `web/drizzle/20260826083517_jazzy_cassandra_nova/`

## TDD flow

### Red

- Added domain tests first for:
  - same-secret decrypt round trip
  - wrong secret rejection
  - tamper rejection
  - malformed envelope rejection
  - weak/missing master secret rejection
  - masked API key formatting
  - provider/baseUrl/unknown-field validation
- Added schema migration test first for:
  - `ai_provider_configs` column creation
  - provider primary key
  - preserving populated `attempts` rows after migrating from the previous schema set

Observed initial failures:

- `src/domain/ai/provider-config.test.ts` failed because `provider-config-crypto.ts` did not exist yet.
- `src/db/schema.test.ts` failed because `ai_provider_configs` was absent from the migrated schema.

### Green

- Implemented AES-256-GCM envelope helpers with:
  - 12-byte random nonce per encryption
  - SHA-256 derived 32-byte cipher key from `AI_CONFIG_ENCRYPTION_KEY`
  - envelope format `v1.<nonce>.<ciphertext>.<tag>`
  - strict rejection for malformed version/segment/authentication failures
- Implemented strict provider config validation with:
  - providers limited to `openai | deepseek`
  - URL protocol limited to `http`/`https`
  - nonblank model name with a bounded length
  - boolean `enabled`
  - no unknown fields
- Implemented `maskApiKey()` as six bullets plus the trailing four characters, empty string for empty input.
- Added `ai_provider_configs` to the Drizzle schema with the required columns and provider primary key.
- Generated the migration and snapshot via `npm run db:generate`.

## Verification run

Executed:

```powershell
Set-Location web
npm test -- --run src/domain/ai/provider-config.test.ts
npm run db:generate
npm test -- --run src/db/schema.test.ts src/db/client.test.ts
npm run typecheck
```

Results:

- `src/domain/ai/provider-config.test.ts`: passed, 5 tests
- `src/db/schema.test.ts src/db/client.test.ts`: passed, 9 tests
- `npm run typecheck`: passed

## Notes

- No plaintext API key or encrypted envelope contents were written into committed fixtures, tests, logs, or the report.
- This task intentionally stops at the domain/storage foundation. No outbound provider calls, usage tracking, fallback logic, route handlers, or frontend handling were added.
- The generated migration directory name came from `drizzle-kit generate`, which the task brief explicitly allows.

## Self-review

- The crypto code is intentionally minimal and uses only Node built-ins.
- Validation is strict and rejects unsupported providers, unsafe URL protocols, and unknown fields.
- The migration test exercises the real migration path and confirms existing `attempts` data survives the new table addition.
