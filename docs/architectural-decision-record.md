# Architectural decision record

Decisions local to this repository. Cross-repo decisions live in the root repository.

## ADR-001 SDK and console in one workspace

- Status: Accepted (J, 2026-11-20)
- Context: the console is the SDK's first consumer; both follow the same API contract.
- Decision: `packages/sdk` and `apps/console` in this repository; the SDK stays independently publishable.
- Consequences: SDK changes and the console features that need them land together.

## ADR-002 Biome instead of ESLint and Prettier

- Status: Accepted
- Context: TypeScript 7's native compiler does not expose the JavaScript API that typescript-eslint uses.
- Decision: Biome for lint and format; `tsc` 7 for type-checking only.
- Consequences: revisit when typescript-eslint supports TypeScript 7.

## ADR-003 Clean architecture in the console

- Status: Accepted
- Decision: domain / application / infrastructure / presentation / main, with an automated dependency test.
- Consequences: use cases are testable with fake ports; the SDK is replaceable behind ports.

## ADR-004 Bun as runtime and package manager

- Status: Accepted (J, 2026-11-21; root ADR-012, decision D8)
- Context: J asked to use Bun as the runtime where it is available.
- Decision: Bun 1.4.4 pinned in `packageManager`; Bun workspaces replace `pnpm-workspace.yaml`; `bun.lock`
  replaces `pnpm-lock.yaml`; scripts run with `bun run`, workspace scripts with `bun run --filter`;
  `bun audit` replaces `pnpm audit`. Node.js 22+ stays installed as the fallback runtime for any tool that
  does not run on Bun. Vite, Vitest, Biome and `tsc` 7 are unchanged.
- Consequences: one lockfile format; contributors install Bun instead of enabling corepack. If a tool
  fails on Bun, run it under Node and record the exception here.

## ADR-005 Pinned contract snapshot (WD-2, WD-8)

- Status: Accepted (draft from step 3; confirmed at step 4)
- Context: `-restapi` has no tag; the SDK must be generated reproducibly from its OpenAPI.
- Decision: byte snapshot of `openapi.yaml`, `permissions.json`, `operations.json` in `packages/sdk/contract/`
  with `contract.lock.json` (source, ref, commit, sha256). `contract:check` runs first in the gate;
  `contract:update --ref` is the only way to change it. `CONTRACT_VERSION` is the snapshot's `info.version`.
- Consequences: a hand edit fails the gate; moving to a newer contract is one reviewed commit.

## ADR-006 Own code generator and generated resource modules (WD-3, WD-4, WD-5, WD-6, WD-7)

- Status: Accepted (draft)
- Decision: `tools/codegen` (Bun + `yaml`) emits schemas (open enums, branded `Money`, `readonly` server
  fields), the operation table and one factory per resource, plus the `createAfs` facade. Signature: positional
  path params, then body, then options; `If-Match` operations accept a `Versioned` and derive a reader for the
  rest. `PUT` sends `If-Match` when a version is held; a schema without `version` sends `"1"` (interim).
- Consequences: the method table cannot drift; 182 methods are not hand-maintained.

## ADR-007 Libraries (WD-9)

- Status: Accepted (draft)
- Decision: TanStack Query v5, React Router, `oauth4webapi` (no storage of its own, so tokens stay in
  memory), `web-vitals`; Testing Library with happy-dom, axe-core, Playwright with `@axe-core/playwright`,
  Vitest browser mode. No chart library and no CSS-in-JS (CSS modules, CSP `script-src 'self'`).

## ADR-008 E2E on a fake API and a fake IdP (WD-10)

- Status: Accepted (draft)
- Decision: gated e2e runs against `e2e/fake-afs` (routes and fixtures validated against the pinned OpenAPI;
  `If-Match`, `Idempotency-Key`, 429/503 injection, CORS, request recorder) and a fake OIDC IdP. The e2e build
  (`vite build --mode e2e`) compiles a test-only cache hook and allows an `http` issuer. The dev-environment run
  is the opt-in `e2e:dev` project.
- Consequences: no test calls a real service; CORS and header behaviour are exercised in a real browser.

## ADR-009 Visual baselines (WD-11)

- Status: Accepted (draft)
- Decision: 1440 x 900 at device scale 2 (2880 x 1800, the mockups' size), `maxDiffPixelRatio` 0.005; baselines
  start `pending` in `e2e/visual/approvals.json`; `bun run e2e:report` builds a side-by-side HTML report.
