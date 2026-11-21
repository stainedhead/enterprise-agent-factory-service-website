# Spec: `-website` feature complete (`@afs/sdk` and the console)

| | |
|---|---|
| **Spec** | `specs/261121-website-feature-complete/` (created 2026-11-21 by `create-spec`, step 1 of `implm-frm-prd`) |
| **Source PRD** | [`enterprise-agent-factory-service-website-PRD.md`](enterprise-agent-factory-service-website-PRD.md) (moved here; the repo root keeps a stub that points to it) |
| **Branch** | `feat/website-feature-complete` |
| **Scope** | Feature complete: every requirement of PRD §3 (SDK-1..11, WEB-1..22) and every criterion of the 42 stories in §5 (182 criteria). Milestones M0–M6 are build order only; all are in scope |
| **Contracts (names followed exactly)** | Root `docs/contracts/api-contract.md` (v1.2.0 text, which records CD-1..CD-10); generation source `-restapi/api/openapi.yaml` (OpenAPI 3.1, `info.version` 1.1.0, 182 operations) |
| **Contract snapshot** | `packages/sdk/contract/` pinned to `-restapi` branch `feat/restapi-feature-complete` commit `747a484` (openapi.yaml sha256 `3456b9e9…fb2b0e`); re-pinned to the first `-restapi` release tag (plan.md §5) |
| **Mockups** | Root `docs/ui/*.png` (2880 × 1800, that is 1440 × 900 at 2×) and their HTML sources in `docs/ui/source/` |
| **Status** | Draft (step 1, 2026-11-21); review pending (step 2) |

## 1. Executive summary

This repository is how people and TypeScript code reach the Enterprise Agent Factory Service. It ships
two packages in one Bun workspace. **`@afs/sdk`** is a typed, zero-dependency client for all 182
operations of the API contract, generated from a checksummed snapshot of `-restapi`'s `openapi.yaml`, with
safe writes (`If-Match`, idempotency keys), retries, pagination, `waitFor`, CSV reports and strict secret
hygiene. **`@afs/console`** is the AWS-console-style web console of the root PRD §5: 33 screens (S1–S11,
T1–T15, V1–V2, P2–P6) for service admins, team-admins, team viewers and security operators, role-aware from
`GetMe`, accessible (WCAG 2.2 AA), matching the approved mockups, and built with clean architecture on the
SDK. It is hosted as a static bundle on S3 + CloudFront with runtime `config.json`.

This spec turns the PRD into a plan for milestone agents (M0 to M6). Each milestone splits into parallel
worker streams with explicit file ownership so they can run in separate git worktrees (tasks.md).

## 2. Problem statement

The repository is a scaffold: the SDK has a base `request` and an `AfsError` with one getter and a closed
code union; the console has one use case (health) wired through every layer and a `permission.ts` with an
outdated three-role model (`budgets:set-ceiling`, no `security_operator`, `Principal`/`bindings` instead of
the contract's `Me`). `-restapi` now publishes the full v1 OpenAPI document (182 operations, each carrying
`x-afs-sdk`, `x-afs-cli`, `x-afs-permission`, `x-afs-screen`, `x-afs-csv`) and the permission catalog
fixture (`api/contract/permissions.json`). Clients and pipelines cannot use AFS until this repository
generates a client from that document and builds the console on it.

## 3. Goals and non-goals

### Goals

1. `@afs/sdk` exposes exactly the contract's `operationId` → SDK method table (182 methods), generated from
   the pinned snapshot, never hand-edited, with a coverage test that fails on drift (SDK-1).
2. The SDK makes the safe call the easy call: `If-Match` from the resource version, read-first for id-only
   calls, idempotency keys reused across retries, bounded jittered retries, typed errors (SDK-2..6, SDK-10).
3. The console implements every screen of root §5.3 and every IA item of root §5.2 as a route (WEB-1,
   WEB-18), role-aware from `GetMe` (WEB-3, WEB-4), with the contract's status vocabulary (WEB-7).
4. No secret value or token ever reaches state, cache, URL, storage, logs or telemetry (SDK-11, WEB-8,
   WEB-US-7, WEB-US-11), proven by sentinel e2e tests.
5. Every screen passes axe (no serious or critical issues) and a Playwright visual snapshot matched to its
   mockup (WEB-10, WEB-US-42).
6. `bun run gate` green on every commit; `domain` and `application` ≥ 90% coverage.

### Non-goals (PRD §2, unchanged)

No secret reveal; no direct Kubernetes or AWS calls from browser or SDK; no i18n (en-US, USD, browser time
zone with UTC on hover); no offline mode or service-worker caching of API data; no layout below 1024 px (a
"Use a wider window" notice instead); no full-text search or search API (D44); no push updates (polling,
WEB-7); no client-side workflows that combine several mutations behind one button. Also out of scope here:
the CloudFront/S3 Terraform itself (platform), IdP app registrations (J / IdP admins), the API and its
RBAC (`-restapi`).

## 4. Requirements

### 4.1 Functional requirements

FR ids are this spec's; the PRD id is the one tasks and tests cite. The story column names the PRD §5
stories whose criteria prove the requirement (catalogue in §9).

| FR | PRD id | Requirement (summary; PRD §3 is authoritative) | Pri | Milestone | Stories |
|---|---|---|---|---|---|
| FR-001 | SDK-1 | Types and a resource client per namespace generated from the pinned `openapi.yaml`; method names from `x-afs-sdk` (= contract §4 table); coverage test | P0 | M0 | WEB-US-1 |
| FR-002 | SDK-2 | Bearer token supplier `({forceRefresh}) => Promise<string>` and static API key; one forced refresh and one retry on `401`; `Authorization` never logged | P0 | M0 | WEB-US-2 |
| FR-003 | SDK-3 | Async-iterator pagination plus `.pages()`, `maxResults`, `nextToken` | P0 | M0 | WEB-US-1 |
| FR-004 | SDK-4 | Safe writes: `If-Match` from resource or `{id, version}`; id-only read-first with `appliedToVersion`; generated reusable `Idempotency-Key` on creates and `:verb`; `meta.idempotentReplayed` | P0 | M0 | WEB-US-1, WEB-US-3 |
| FR-005 | SDK-5 | `AfsError` (`code` open union, `status`, `requestId`, `details`) with ten getters | P0 | M0 | WEB-US-1, WEB-US-3 |
| FR-006 | SDK-6 | Full-jitter retries (200 ms base, 5 s cap, 3 retries) for `429`, `503`, `idempotency_in_progress`, network errors, with the method rules; abortable waits | P0 | M0 | WEB-US-3 |
| FR-007 | SDK-7 | `waitFor(resource, {until, timeoutMs, signal})` with the W-1 cadence | P1 | M1 | WEB-US-4 |
| FR-008 | SDK-8 | Typed reports (`rows`, `totals`, `notes`) and `asCsv()` | P0 | M3 | WEB-US-4 |
| FR-009 | SDK-9 | Browsers, Bun 1.4, Node 22; ESM; `sideEffects: false`; tree-shakeable; core ≤ 25 KB gzip, resource ≤ 3 KB gzip; TSDoc on every export | P0 | M0 | WEB-US-4 |
| FR-010 | SDK-10 | Wire fidelity: `Money` strings, open enums, unknown fields ignored, `X-Request-Id`, non-JSON bodies, non-JSON errors, `X-Afs-Contract-Version` | P0 | M0 | WEB-US-5 |
| FR-011 | SDK-11 | Secret values and `secretKey` never logged, cached or in errors, debug hooks or retry diagnostics | P0 | M0 | WEB-US-6 |
| FR-012 | WEB-1 | Every screen of root §5.3 matching its mockup (S10, S11, T14, T15 follow the S2 table pattern), Playwright visual snapshots | P0–P2 | M1–M6 | WEB-US-12..42 |
| FR-013 | WEB-2 | Sign-in: provider picker, deep links, OIDC code + PKCE S256, memory-only tokens, silent renew, `401` handling, sign-out | P0 | M0 | WEB-US-7 |
| FR-014 | WEB-3 | Role-aware header, navigation, team switcher, disabled actions with "Requires <role>", access-denied alerts | P0 | M0 | WEB-US-8 |
| FR-015 | WEB-4 | `can(me, permission, teamId)` from `GetMe` `permissions[]`; `permission.ts` catalog for tooltips and drift test | P0 | M0 | WEB-US-8 |
| FR-016 | WEB-5 | AWS-console patterns: header with search, environment and identity, left nav, breadcrumbs, page header with *Info*, tables, one primary action, *Actions*, wizards with review | P0 | M0 | WEB-US-8, WEB-US-42 |
| FR-017 | WEB-6 | Every create form shows the equivalent `afs` command, never with a secret value | P0 | M1 | WEB-US-14, WEB-US-26, WEB-US-11 |
| FR-018 | WEB-7 | Status dot + word (§4.2 vocabulary), `observedGeneration`, W-1 polling, hidden-page stop, `Retry-After` | P0 | M1 | WEB-US-9 |
| FR-019 | WEB-8 | Secret values and new `secretKey` only in the input or one-time dialog | P0 | M1–M2 | WEB-US-11 |
| FR-020 | WEB-9 | Reports: charts and tables, range, filters, grouping incl. tag, CSV, scheduling, *Unmetered* notices | P0 | M3–M4 | WEB-US-37 |
| FR-021 | WEB-10 | WCAG 2.2 AA; axe per screen | P0 | M0–M6 | WEB-US-42 |
| FR-022 | WEB-11 | `412` "This changed since you opened it" with *Reload*, edits kept; request id on every error alert | P0 | M1 | WEB-US-10 |
| FR-023 | WEB-12 | Pools & stages (P4), ephemeral teams only | P2 | M5 | WEB-US-39 |
| FR-024 | WEB-13 | Work orders (P3, P6), owners via `ListTeamDirectory` and team configuration (D38); swarm templates (P5) | P2 | M6 | WEB-US-40, WEB-US-41 |
| FR-025 | WEB-14 | Isolation tier on team detail, service admins only | P1 | M5 | WEB-US-23 |
| FR-026 | WEB-15 | Viewer kubectl switch; *Download kubeconfig* and CLI command | P2 | M5 | WEB-US-23 |
| FR-027 | WEB-16 | S10 tabs: settings, identity providers, storage classes, agent templates, notification channels, service API keys, security operators | P0–P2 | M1–M6 | WEB-US-20 |
| FR-028 | WEB-17 | S11 export and import (dry run, account map) | P1 | M4 | WEB-US-21 |
| FR-029 | WEB-18 | Every IA item maps to a screen id and route; test | P0 | M0 | WEB-US-8 |
| FR-030 | WEB-19 | S9 cost tag status and one-time activation banner | P2 | M4–M5 | WEB-US-19 |
| FR-031 | WEB-20 | S10 *Agent templates*; T3 and *Create pool* offer enabled templates and allowed digests | P0 | M2, M5 | WEB-US-22 |
| FR-032 | WEB-21 | T14 log delivery and notification channels | P1 | M3–M4 | WEB-US-34 |
| FR-033 | WEB-22 | T15 activity and audit, config revisions with diff and restore (dry run first) | P0 | M1, M4 | WEB-US-35 |

### 4.2 Hosting and configuration requirements (PRD §6.2, D43)

| FR | Requirement | Milestone |
|---|---|---|
| FR-034 | One static build promoted unchanged across dev, stage, prod; no per-environment `VITE_*` value | M0 |
| FR-035 | `/config.json` fetched at boot with `no-cache`: `apiUrl`, `environmentName`, `redirectUri`, `providersFallback`, `telemetryUrl?`, `idleTimeoutMinutes`; missing or invalid → configuration error page | M0 |
| FR-036 | Caching: hashed assets immutable for a year; `index.html`, `config.json` `no-cache`; SPA fallback to `index.html` | M0 |
| FR-037 | CSP `default-src 'self'; script-src 'self'; connect-src 'self' <apiUrl> <issuers> <telemetryUrl>; frame-ancestors 'none'; object-src 'none'`, HSTS, `Referrer-Policy: no-referrer`, `nosniff`; the build emits no inline script and needs no inline style element | M0 |
| FR-038 | The console works with the API's CORS headers (allow `Authorization`, `Content-Type`, `If-Match`, `Idempotency-Key`, `X-Request-Id`; expose `ETag`, `X-Request-Id`, `Idempotent-Replayed`, `Retry-After`, `X-Afs-Contract-Version`, `X-Afs-Next-Token`) and sends no other custom header | M0 |

### 4.3 Non-functional requirements (PRD §7)

| NFR | Requirement | How it is checked |
|---|---|---|
| NFR-1 Performance | FCP < 1.5 s, route change < 300 ms with cached data on the reference laptop; initial route bundle ≤ 300 KB gzip | Bundle budget in CI (`size:console`); Lighthouse-style Playwright trace on the fake API with 40 ms RTT throttling (M6-Q) |
| NFR-2 SDK size | Core ≤ 25 KB gzip; each resource module ≤ 3 KB gzip | `size:sdk` in the gate (M0-P) |
| NFR-3 Browsers | Last 2 majors of Chrome, Edge, Firefox, Safari; min viewport 1024 px | Vite `build.target` from browserslist; Playwright projects Chromium, Firefox, WebKit for the e2e smoke set |
| NFR-4 Reliability | API down / `503` banner with *Retry*, no loss of non-secret input; `429` pauses polling, "Slowing down" notice; failing widget shows its own error | WEB-US-10 tests; widget error boundary tests |
| NFR-5 Observability | Web Vitals and uncaught errors to `telemetryUrl` with route templates, build version and request ids only; no PII, tokens, form values or secrets | Telemetry unit tests; sentinel e2e covers telemetry payloads |
| NFR-6 Security | CSP without `unsafe-inline` scripts; tokens in memory; OWASP ASVS L2 controls relevant to a SPA | Built-output test, storage e2e, sentinel e2e, M6 ASVS checklist |
| NFR-7 Quality | `domain`/`application` ≥ 90% coverage; denied-case test per permission rule; `bun run gate` per commit | `test:cover` thresholds in Vitest config |
| NFR-8 Accessibility | WCAG 2.2 AA | axe in component tests and per-screen e2e; keyboard-only flows |

## 5. System architecture

Details in architecture.md. Summary:

- **SDK** (`packages/sdk`): `contract/` (pinned snapshot + `contract.lock.json`), `tools/` (contract sync,
  codegen, size and TSDoc checks, all Bun scripts), `src/core/` (transport, auth, retry, idempotency,
  concurrency, pagination, errors, wire handling, debug hook), `src/generated/` (schema types, operation
  table, one resource module per SDK namespace, all generated), `src/resources/` (hand-written extensions:
  `waitFor`, report CSV, read-before-write lookups), `src/index.ts` (only public surface).
- **Console** (`apps/console`): `domain` (Me and `can()`, permission catalog, status vocabulary and polling
  policy, navigation, money, names, CLI preview builder, search filter), `application` (ports per area, one
  class per use case), `infrastructure` (SDK adapters per area, OIDC, runtime config, telemetry, browser
  storage for the provider id only), `presentation` (design-system components, shell, query layer, screens),
  `main` (composition root). `architecture.test.ts` enforces the dependency rule.
- **E2E** (`apps/console/e2e`): Playwright against a **fake AFS API and fake OIDC provider** served by Bun
  from fixtures validated against the pinned OpenAPI. No gated test calls a real API. A separate opt-in
  `e2e:dev` project runs the same Given/When/Then specs against the dev environment once it exists (PRD §8).

## 6. Scope of changes

| Path | Change |
|---|---|
| `packages/sdk/contract/` | New: `openapi.yaml`, `permissions.json`, `operations.json` copied from `-restapi`; `contract.lock.json` with source repo, ref, commit and sha256 per file |
| `packages/sdk/tools/` | New: `contract-sync.ts`, `codegen/`, `size-check.ts`, `tsdoc-check.ts` |
| `packages/sdk/src/` | Rewrite: `core/`, `generated/`, `resources/`, `index.ts`; current `client.ts`/`errors.ts` replaced (breaking, pre-1.0) |
| `apps/console/src/` | All layers grow; `domain/permission.ts` replaced by the `Me` model and full catalog (M0) |
| `apps/console/public/config.json` | New: local development runtime config (not deployed) |
| `apps/console/deploy/` | New: CloudFront response headers policy and cache behaviours as JSON for the platform Terraform, plus a test that the build satisfies them |
| `apps/console/e2e/` | New: Playwright config, fake API, fake IdP, fixtures, specs, visual baselines and approvals |
| `package.json`, `apps/*/package.json`, `bun.lock` | New dev and runtime dependencies (architecture.md §8); scripts `contract:check`, `codegen`, `codegen:check`, `size`, `tsdoc`, `test:cover`, `e2e`, `e2e:visual`, `e2e:dev` |
| `.github/workflows/ci.yml` | Gate plus SDK runtime matrix (Node 22, Bun, Chromium) and Playwright job |
| `docs/`, `user-docs/`, `README.md`, `AGENTS.md` | ADR-005.. for the decisions in implementation-notes.md; technical details; user docs for SDK and console (step 4); AGENTS.md checklist line on `VITE_*` updated to runtime `config.json` (D43) |

## 7. Breaking changes

- **SDK public surface** (pre-1.0, version `0.0.1`): `AfsClient.health()` becomes `health.get()`;
  `TokenProvider` becomes `AuthProvider` (`bearer(supplier)` or `apiKey(key)`); `AfsErrorCode` becomes an
  open union. Released as `0.1.0`; nothing outside this repository consumes `0.0.1`.
- **Console config:** `VITE_AFS_ENDPOINT` is replaced by runtime `config.json` (`apiUrl`). Local dev uses
  `apps/console/public/config.json`.
- **Domain:** `Principal`, `Binding`, `Role` without `security_operator`, `budgets:set-ceiling` and
  `api-keys:write`-only are removed from `permission.ts`.
- No API, schema or config changes in other repositories come from this spec; needs from them are in §11.

## 8. Success criteria and quality gates

- Every criterion WEB-US-n.m (§9) is cited by at least one task whose tests prove it; every SDK-n and
  WEB-n is cited by a task (traceability: tasks.md *Traceability*).
- `bun run gate` = `bun install --frozen-lockfile`, `contract:check`, `codegen:check`, `lint`, `typecheck`,
  `test` (with coverage thresholds), `build`, `size`, `tsdoc`. Green before every commit.
- CI additionally runs the SDK suite under Node 22, Bun 1.4 and Chromium, and the Playwright e2e, axe and
  visual suites on the fake API.
- Visual baselines: one per screen at 1440 × 900 (device scale factor 2, matching the mockup PNGs),
  `maxDiffPixelRatio` 0.005; first baselines listed in `e2e/visual/approvals.json` as `pending` until the
  web lead approves them side by side with the mockup (W-3).
- Definition of done per change: PRD §11.

## 9. Story criteria catalogue

Criteria are cited as `WEB-US-<story>.<bullet>`, bullets numbered from 1 in PRD §5 order. Counts:

| Story | Title | Criteria | Milestone |
|---|---|---|---|
| WEB-US-1 | Typed automation | 6 | M0 |
| WEB-US-2 | Authentication | 4 | M0 |
| WEB-US-3 | Resilient calls | 6 | M0 |
| WEB-US-4 | Waiting, reports and runtimes | 5 | M0 (.3–.5), M1 (.1), M3 (.2) |
| WEB-US-5 | Wire fidelity | 5 | M0 |
| WEB-US-6 | Safe secrets in the SDK | 2 | M0 |
| WEB-US-7 | Sign in | 9 | M0 |
| WEB-US-8 | A shell that follows the API's decision | 9 | M0 |
| WEB-US-9 | Desired vs actual | 6 | M1 |
| WEB-US-10 | Conflicts and failures | 3 | M1 |
| WEB-US-11 | Secret values never leave the field | 4 | M1–M2, completed M6 |
| WEB-US-12 | Service dashboard (S1) | 3 | M1 (variance banner data M3) |
| WEB-US-13 | Teams (S2) | 5 | M1 |
| WEB-US-14 | Onboard a team (S3) | 4 | M1 |
| WEB-US-15 | Model prices (S4) | 1 | M3 |
| WEB-US-16 | Audit log (S5) | 3 | M4 |
| WEB-US-17 | Team AWS account access (S6) | 3 | M4 |
| WEB-US-18 | External systems catalog (S7) | 4 | M2 |
| WEB-US-19 | Cost allocation tags (S9) | 4 | M4 (.1, .2, .4), M5 (.3) |
| WEB-US-20 | Service settings (S10) | 8 | M1, M2, M4, M6 |
| WEB-US-21 | Export and import (S11) | 2 | M4 |
| WEB-US-22 | Agent templates (S10 tab) | 3 | M2 (.2 for pools in M5) |
| WEB-US-23 | Guardrails | 3 | M5 |
| WEB-US-24 | Team overview (T1) | 6 | M1 |
| WEB-US-25 | Agents (T2) | 5 | M2 (.4 identities M4) |
| WEB-US-26 | Create agent (T3) | 7 | M2 |
| WEB-US-27 | Secrets (T4) | 4 | M2 |
| WEB-US-28 | Budget and usage (T5) | 4 | M3 |
| WEB-US-29 | Members and API keys (T6) | 5 | M1 |
| WEB-US-30 | Configuration values (T7) | 4 | M2 |
| WEB-US-31 | Agent AWS access (T8) | 4 | M4 |
| WEB-US-32 | External systems (T9, T10) | 3 | M2 |
| WEB-US-33 | Team tags (T13) | 2 | M4 |
| WEB-US-34 | Log delivery and notifications (T14) | 5 | M3 (notifications), M4 (log delivery) |
| WEB-US-35 | History (T15) | 3 | M1 (.1, .2), M4 (.3) |
| WEB-US-36 | Read-only that explains itself | 2 | M2, swept in M6 |
| WEB-US-37 | Reports and scheduling | 7 | M3 (.1–.5), M4 (.6, .7) |
| WEB-US-38 | Budgeted POC (P2) | 3 | M5 |
| WEB-US-39 | Pools and stages (P4) | 6 | M5 |
| WEB-US-40 | Work orders (P3, P6) | 6 | M6 |
| WEB-US-41 | Swarm templates (P5) | 2 | M6 |
| WEB-US-42 | Accessible and true to the mockups | 2 | every screen task, swept in M6 |
| | **Total** | **182** | |

### 9.1 Screens, mockups and routes

| Screen | Mockup (root `docs/ui/`) | Route(s) (PRD §4.1) | Milestone |
|---|---|---|---|
| S1 Service dashboard | `01-admin-dashboard.png` | `/` | M1 |
| S2 Teams (+ budgets view) | `02-admin-teams.png` | `/teams`, `/teams?view=budgets` | M1 |
| S3 Create team | `03-admin-create-team.png` | `/teams/new` | M1 |
| S4 Models and pricing | `04-admin-models.png` | `/models` | M3 |
| S5 Audit log | `05-admin-audit.png` | `/audit` | M4 |
| S6 Team AWS account access | `18-admin-team-aws-accounts.png` | `/teams/:teamId/admin` (tab) | M4 |
| S7 External systems catalog | `19-admin-external-systems.png` | `/external-systems` | M2 |
| S8 Reports (+ reconciliation) | `22-admin-reports.png` | `/reports`, `/reports/reconciliation` | M3 |
| S9 Cost allocation tags | `25-admin-cost-tags.png` | `/cost-tags` | M4–M5 |
| S10 Service settings | none: S2 table pattern | `/settings/:section`, `/settings/agent-templates` | M1–M6 |
| S11 Export and import | none: S2 table pattern | `/export-import` | M4 |
| T1 Team overview (+ *Models* tab) | `06-ta-team-overview.png` | `/t/:teamId`, `/t/:teamId/models` | M1 |
| T2 Agents (detail panel) | `07-ta-agents.png` | `/t/:teamId/agents[/:agentId]` | M2 |
| T3 Create agent | `08-ta-create-agent.png` | `/t/:teamId/agents/new` | M2 |
| T4 Secrets | `09-ta-secrets.png` | `/t/:teamId/secrets` | M2 |
| T5 Budget and usage | `10-ta-budget.png` | `/t/:teamId/budget` | M3 |
| T6 Members and API keys | `11-ta-members.png` | `/t/:teamId/members`, `/t/:teamId/members/api-keys` | M1 |
| T7 Configuration values | `16-ta-config-values.png` | `/t/:teamId/config` | M2 |
| T8 Agent AWS access (+ team identities view) | `17-ta-agent-aws-access.png` | agent panel tab; `/t/:teamId/identities` | M4 |
| T9 External systems, team | `20-ta-external-systems.png` | `/t/:teamId/external-systems` | M2 |
| T10 Agent external systems | `21-ta-agent-external-systems.png` | agent panel tab | M2 |
| T11 Team reports | `23-ta-team-reports.png` | `/t/:teamId/reports` | M3 |
| T12 Agent usage | `24-ta-agent-report.png` | agent panel tab | M3 |
| T13 Team cost tags | `26-ta-team-tags.png` | `/t/:teamId/tags` | M4 |
| T14 Log delivery and notifications | none: S2 table pattern | `/t/:teamId/delivery/logs`, `/t/:teamId/delivery/notifications` | M3–M4 |
| T15 History | none: S2 table pattern | `/t/:teamId/history/audit`, `/t/:teamId/history/revisions` | M1, M4 |
| V1 Team overview, viewer | `12-tv-team-overview.png` | `/t/:teamId` (viewer) | M1 |
| V2 Secrets, viewer | `13-tv-secrets.png` | `/t/:teamId/secrets` (viewer) | M2 |
| P2 Ephemeral team budget | `14-admin-ephemeral-team.png` | `/teams/new` (ephemeral) | M5 |
| P3 Work orders | `15-admin-work-orders.png` | `/work-orders` | M6 |
| P4 Pools and stages | `27-ta-swarm-pools.png` | `/t/:teamId/pools` | M5 |
| P5 Swarm templates | `28-admin-swarm-templates.png` | `/swarm-templates` | M6 |
| P6 Work order detail | `29-sec-work-order-detail.png` | `/work-orders/:id` | M6 |
| Auth and system pages | none | `/sign-in`, `/auth/callback`, `/signed-out`, not-found, configuration error | M0 |

## 10. Risks and mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| The OpenAPI changes before `-restapi` tags a release | SDK or screens drift from the server | Pinned snapshot with checksum; `contract:check` in the gate; `contract:update` re-pin task per `-restapi` milestone exit and at release (plan.md §5); generated code is never edited, so a re-pin is regenerate + fix compile errors |
| TypeScript 7 (native) breaks tools that load the TS JS API (`openapi-typescript`, typedoc, ts-morph) | Codegen or TSDoc lint cannot run | Own codegen writing TS text from a YAML parse; TSDoc check reads emitted `.d.ts` text, not the TS API (research.md R-2) |
| Visual baselines need human approval that implementers cannot give | Snapshot gate meaningless or blocking | Baselines committed with `pending` approval and a side-by-side report artifact; CI enforces drift against committed baselines; approval tracked as an owner item (W-3) |
| Mockups show data the API does not return, or an op the screen needs is missing | Screen cannot match mockup | Fixture data comes from the mockup but is validated against the OpenAPI schemas; any field gap is logged in implementation-notes.md as a contract question to `-restapi`, never invented in the SDK |
| Secret value leaks through React state, query cache or devtools | Security failure (SEC-1) | Uncontrolled secret inputs read via ref at submit; mutations with secrets bypass TanStack's mutation cache (`gcTime: 0`, variables scrubbed); sentinel e2e over every store (WEB-US-11.1) |
| Polling load with many tabs and rows | `429`s, cost | One list query per interval (WEB-US-9.4), hidden-tab stop, `Retry-After` honoured globally per client |
| CSP forbids inline styles injected at runtime | Broken styling in prod | CSS modules only, no CSS-in-JS; built-output test (FR-037) |
| Dev environment and seeded users (PRD §9) not ready | Real-environment e2e cannot run | Gated e2e uses the fake API; `e2e:dev` opt-in project runs once the platform dependency lands |
| Server-side gaps (CD-9 single client id; `ListSignInProviders` without `?teamId=`, OQ-W2) | Deep link or CLI client id behaviour differs | Console sends and shows both ids as the contract says; deep link uses remembered or default provider (PRD WEB-US-7.2/.3) |

## 11. Dependencies on other repositories (PRD §9)

| Need | From | Status at spec time | Blocks |
|---|---|---|---|
| `openapi.yaml` with all 182 operations | `-restapi` | Present on `feat/restapi-feature-complete` (`747a484`), not yet on `main` or tagged | Nothing (snapshot); re-pin at tag |
| Permission catalog fixture | `-restapi` | `api/contract/permissions.json` present (4 roles) | Nothing (snapshot) |
| CLI command and flag names | `-cli` / contract | `x-afs-cli` on every operation; flags are kebab-case mirrors of API fields (`-cli` AGENTS.md) | Nothing |
| Mockups for S10, S11, T14, T15; T7 in root IA (OQ-W1) | root (J) | Open | Visual approval for those four screens only |
| S3 + CloudFront, headers policy, `config.json` per environment | platform | Open | Deployment, not development |
| IdP SPA registrations | J / IdP admins | Open | `e2e:dev` only |
| Dev environment with seeded users per role | platform | Open | `e2e:dev` only |
| `api.cors_origins` and CORS headers | `-restapi` | In contract §1; implementation pending in `-restapi` | `e2e:dev` only |

## 12. Open questions (carried from PRD §12.1, with the interim decision)

| # | Question | Owner | Interim decision in this spec |
|---|---|---|---|
| OQ-W1 | Mockups for S10, S11, T14, T15; T7 in the root IA | root (J) | S2 table pattern; T7 placed under *Configuration › Configuration values* in the navigation so WEB-18 holds (WD-13) |
| OQ-W2 | `ListSignInProviders?teamId=` | `-restapi` / J | Not in the OpenAPI; deep link uses remembered or default provider (WD-14) |
| OQ-W4 | Telemetry backend | platform | Backend-neutral JSON beacon to `telemetryUrl` (WD-15) |
| OQ-W5 | Idle sign-out default | J | 60 min default, `idleTimeoutMinutes` in `config.json` (WD-16) |
| OQ-W6 | SSE instead of polling | web lead | Polling only (non-goal); revisit after M3 |
| OQ-W7 | Shared golden CLI fixtures with `-cli` | `-cli` / web lead | Golden fixtures local to this repo, built from `x-afs-cli` (WD-17) |
| OQ-9 | IdP-to-IAM federation for viewer kubectl | J | *Download kubeconfig* shows the file and the CLI command only; instructions text is a single replaceable component (WD-28) |
| OQ-W8 (new) | Agent panel *Logs* tab: the API has no log-read operation | root (J) / `-restapi` | Tab shows the team's log destinations (T14) with links and the CLI command; no log content (WD-29) |
| OQ-W9 (new) | OpenAPI `info.version` is 1.1.0 while the contract text is v1.2.0 | `-restapi` | SDK pins the snapshot's `info.version`; `X-Afs-Contract-Version` compared against it (WD-8) |

## 13. Timeline and milestones

Milestones match root §9 and PRD §10; tasks.md has the streams.

| Milestone | Content | Exit |
|---|---|---|
| M0 Foundations | Contract snapshot, codegen, SDK core (SDK-1..6, 9..11), console domain (Me, catalog, status, navigation), sign-in, shell, search, routes, UI kit, fake API and e2e harness, hosting config | M0-X1 |
| M1 Teams & access | Query/polling/conflict layer (WEB-7, WEB-11), CLI preview (WEB-6), `waitFor` (SDK-7), S1–S3, T1, V1, T6, S10 settings and identity providers, T15 audit and revisions, telemetry | M1-X1 |
| M2 Agents & secrets | T2–T4, T7, T9, T10, S7, V2, S10 storage classes and agent templates, WEB-8 | M2-X1 |
| M3 Spend control | SDK-8, charts, T5, S4, S8, T11, T12, T14 notifications | M3-X1 |
| M4 Production readiness | S5, S6, S9, T8 (+ identities), T13, T14 log delivery, S11, scheduling, T15 restore, S10 notification channels | M4-X1 |
| M5 Budgeted workloads and swarms | P2, P4, isolation tier, viewer kubectl, cost tag status | M5-X1 |
| M6 CVE remediation | P3, P5, P6, security operator shell, S10 service keys and operators, quality sweep, contract re-pin | M6-X1 (feature complete) |

## 14. References

- Source PRD: [`specs/261121-website-feature-complete/enterprise-agent-factory-service-website-PRD.md`](enterprise-agent-factory-service-website-PRD.md)
- Root PRD: `enterprise-agent-factory-service/enterprise-agent-factory-service-initial-PRD.md` (§4, §5, §6.14, §9, §10.1)
- API contract: `enterprise-agent-factory-service/docs/contracts/api-contract.md`
- OpenAPI: `enterprise-agent-factory-service-restapi/api/openapi.yaml` (branch `feat/restapi-feature-complete`), contract extract `api/contract/*.json`
- `-restapi` contract deltas CD-1..CD-10: `enterprise-agent-factory-service-restapi/specs/261121-restapi-feature-complete/implementation-notes.md`
- Mockups: `enterprise-agent-factory-service/docs/ui/` and `docs/ui/source/`
- Phase files: [research.md](research.md), [data-dictionary.md](data-dictionary.md), [architecture.md](architecture.md), [plan.md](plan.md), [tasks.md](tasks.md), [implementation-notes.md](implementation-notes.md), [status.md](status.md), dashboard [website-feature-complete-status.md](website-feature-complete-status.md)
