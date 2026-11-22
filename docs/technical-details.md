# Technical details

## Toolchain (verified 2026-11-21)

Bun 1.4.4 (runtime, package manager, workspaces via `workspaces` in `package.json`, lockfile `bun.lock`),
Node.js 22+ as fallback runtime, TypeScript 7.0.2, Vite 8.3.8, Vitest 5.1.1, Biome 2.6.8, React 19.3.1.

## Workspace resolution

`@afs/sdk` exports a `source` condition pointing at `src/index.ts`. `tsconfig.base.json` sets
`customConditions: ["source"]` and the console's Vite config adds `source` to `resolve.conditions`, so
the console type-checks and bundles against SDK sources without building the SDK first. Published
consumers resolve `types`/`import` from `dist/`.

## Console layers

`domain` → `application` (use cases, ports) → `infrastructure` (adapters over `@afs/sdk`) →
`presentation` (React) → `main` (composition root). Enforced by `src/architecture.test.ts`.

## Dependencies added in M0 (exact versions, verified to import under TypeScript 7 and Bun 1.4.4)

| Package | Version | Where | Use |
|---|---|---|---|
| `yaml` | 2.9.1 | sdk (dev) | parse the OpenAPI in codegen and tests |
| `@tanstack/react-query` | 5.108.2 | console | server-state cache |
| `react-router` | 8.5.2 | console | routing |
| `oauth4webapi` | 3.8.9 | console | OIDC code + PKCE, no storage of its own |
| `web-vitals` | 6.2.3 | console | LCP, INP, CLS |
| `@testing-library/react` / `user-event` / `dom` | 16.3.3 / 14.6.13 / 10.4.2 | console (dev) | component tests |
| `happy-dom` | 21.0.4 | both (dev) | Vitest DOM |
| `axe-core` / `@axe-core/playwright` | 4.14.1 / 4.14.0 | console (dev) | accessibility checks |
| `@playwright/test` / `playwright` | 1.63.0 | console / sdk (dev) | e2e, visual, SDK browser run |
| `@vitest/coverage-v8`, `@vitest/browser`, `@vitest/browser-playwright` | 5.1.1 | dev | coverage thresholds, SDK Chromium run |

No chart library, no CSS-in-JS, no ESLint or Prettier, no npm or pnpm lockfile.

## Scripts

- `bun run gate`: frozen install, `contract:check`, lint, typecheck, `test:cover`, build (plus `codegen:check`, `size` and `tsdoc` as they land).
- `bun run contract:check`: sha256 of `packages/sdk/contract/*` against `contract.lock.json`.
- `bun run --filter '@afs/sdk' contract:update -- --ref <tag|commit>`: the only way to move the snapshot.
- `bun run test:cover`: Vitest with v8 coverage; the console fails below 90% on `domain` and `application`.
- An unmocked `fetch` throws in every test (`test/setup.ts`).

## M1 (teams and access)

- `@afs/sdk` is 0.2.0 (adds `waitFor`; the public surface is otherwise unchanged). The contract snapshot
  was checked at the M1 exit against `-restapi` `feat/restapi-feature-complete` at `71d2837`: the sha256 of
  `openapi.yaml`, `permissions.json` and `operations.json` equal the lock, so no re-pin was needed.
- Console areas wired in `main/wiring.ts`: teams, overview, dashboard, members, API keys, settings, identity
  providers and history. An area that is not wired makes `useService` throw, and M6-X1 checks none remains.
- Fixtures of the fake AFS API live in `apps/console/e2e/fake-afs/fixtures/<area>.ts`; stateful ones register
  a reset in `fixtures/index.ts`. Every fixture is validated against the pinned OpenAPI.

## Final state (steps 3 and 4, 2026-11-22)

### Packages

- `@afs/sdk` 0.3.0 (workspace name). Published as `@stainedhead/afs-sdk` by `.github/workflows/release-sdk.yml`
  on a tag `sdk-v*` or manual dispatch (ADR-010). Layout: `src/core` (transport, auth, retry, idempotency,
  concurrency, pagination, errors), `src/generated` (never hand-edited), `src/resources` (`waitFor`, reports),
  `tools/` (contract-sync, codegen, size-check, tsdoc-check).
- `@afs/console`: Vite 8 bundle, React 19, TanStack Query for server state (in `presentation` only), React
  Router, `oauth4webapi` for OIDC code + PKCE. CSS modules; no CSS-in-JS and no chart library.

### Contract and code generation

`packages/sdk/contract/` holds the byte snapshot (`openapi.yaml`, `permissions.json`, `operations.json`) and
`contract.lock.json` (source, ref, commit, sha256, `contractVersion`). `contract:check` runs first in the gate.
`codegen` writes `packages/sdk/src/generated/` and `apps/console/src/domain/generated/cliOperations.ts` (the
`afs` command shown on create forms); `codegen:check` covers both. The snapshot moved with the `-restapi`
branch at M2, M3, M4 and M5 (DV-34, DV-40, DV-49, DV-56); M6-U1 pinned it to `-restapi` `main` at
`d887609` (ADR-013), then moved to `763e939` (contract 1.3.1) for Paperclip collaboration. Moving to a release tag waits for `-restapi` to tag.

### Console runtime configuration

One build serves every environment. `/config.json` is fetched with `cache: "no-store"` at boot and validated by
`parseConfig`; the schema is `apps/console/deploy/config.schema.json`. Keys: `apiUrl`, `environmentName`,
`redirectUri` (required), `providersFallback`, `telemetryUrl`, `idleTimeoutMinutes` (5 to 720, default 60).
There are no per-environment `VITE_*` variables. Reference: [user-docs/configuration.md](../user-docs/configuration.md).

### Deploy artifacts (consumed by the platform Terraform)

`apps/console/deploy/response-headers-policy.json` (CSP with `script-src 'self'`, HSTS, `Referrer-Policy`,
`X-Content-Type-Options`; placeholders for the API, issuer and telemetry origins),
`cache-behaviors.json` (`/assets/*` immutable for a year; `/index.html` and `/config.json` `no-cache`; SPA
fallback of 403 and 404 to `/index.html` with 200), `config.schema.json`. `build-output.test.ts` checks the
build against them.

### State and storage

Tokens are in memory only. Non-secret form drafts go to `sessionStorage` (`afs.drafts`) across the top-level
re-authentication redirect and are removed at boot (DV-9). Secret values are never drafted.

### Tests

Vitest (Bun runs it with `--pool=threads`, DV-8) with an unmocked `fetch` that throws; SDK contract replay and a
Chromium run; Playwright e2e and visual baselines against `e2e/fake-afs` and a fake IdP (ADR-008, ADR-009).
`architecture.test.ts` enforces the dependency rule and the wiring test fails if any area is not wired (M6-X1).

### Console areas

All areas are wired in `main/wiring.ts`; `NotBuiltYet` and `notImplementedPort` no longer exist. Per-screen
decisions and deviations are recorded as DV-1 to DV-62 in the spec's `implementation-notes.md`.
