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
