# Tasks: `-website` feature complete

| | |
|---|---|
| **Feature** | website-feature-complete |
| **Date** | 2026-11-21 |
| **Status** | Reviewed (step 2, 2026-11-21); M0 not started |

## How to use this file

- **One milestone agent per milestone (M0 → M6), in order.** It runs the milestone's streams in parallel
  git worktrees (`wt/<Mn>-<stream>` off `feat/website-feature-complete`), merges them in the listed merge
  order, then runs the exit task (`Mn-X1`). Only the milestone agent ticks boxes here and updates
  `status.md` and the dashboard.
- **Streams own files.** A stream creates and edits only the paths in its *Owns* line, plus new
  `*.test.ts(x)` and `*.spec.ts` files beside them, plus **one line** in a shared list (architecture.md
  §3.2: `presentation/routes/registry.tsx`, `main/wiring.ts`, the `tabs.ts`/`sections.ts`/`cards.ts`
  lists, `presentation/search/sources.ts`, `e2e/fake-afs/fixtures/index.ts`, `e2e/visual/approvals.json`,
  `packages/sdk/tools/codegen/emitters.ts`, and from M1 on `packages/sdk/src/index.ts`). Editing anything else is a dependency on another stream
  and must be listed in *Depends*. Paths below are relative to `apps/console/src/` unless they start with
  `packages/`, `apps/` or `e2e/` (= `apps/console/e2e/`).
- **Area files.** A console area stream owns, for its area `<a>`: `application/ports/<a>.ts`,
  `application/usecases/<a>/`, `infrastructure/sdk/<a>.ts`, `e2e/fake-afs/fixtures/<a>.ts` and
  `e2e/specs/<a>/`. These are written as *area files: `<a>`* in the Owns lines.
- **Task ids** `Mn-<stream><seq>`. **AC** cites PRD story criteria as `WEB-US-<story>.<bullet>` (bullets
  numbered from 1 in PRD §5 order; catalogue in spec.md §9). `(part)` means other tasks prove the rest.
  **Req** cites PRD requirements (`SDK-n`, `WEB-n`), spec FRs/NFRs, or decisions. **Depends** lists tasks;
  earlier milestones are implicit.
- **Every task is TDD:** write the AC tests first (red), implement (green), refactor; `bun run gate` green
  before the commit. Use-case tests use in-memory fake ports; SDK and adapter tests use a fake `fetch`;
  screen tests use fake use cases; e2e uses `e2e/fake-afs` (fake API + fake OIDC IdP). **No test calls a
  real API or IdP**; a Vitest setup file makes an unmocked `fetch` throw.
- **Every screen task** gates mutating controls with `can(...)`, disables (not hides) them with the
  "Requires <role>" tooltip, handles `AccessDenied`, shows status with the §4.2 vocabulary only, and adds
  its screen's axe + visual specs in the stream's last task.

## Progress summary

| Milestone | Streams | Tasks | Done |
|---|---|---|---|
| M0 Foundations | 10 (+ exit) | 69 | 69 |
| M1 Teams & access | 10 (+ exit) | 46 | 46 |
| M2 Agents & secrets | 7 (+ exit) | 41 | 22 |
| M3 Spend control | 6 (+ exit) | 24 | 0 |
| M4 Production readiness | 8 (+ exit) | 34 | 0 |
| M5 Budgeted workloads and swarms | 4 (+ exit) | 19 | 0 |
| M6 CVE remediation and completion | 6 (+ exit) | 26 | 0 |
| **Total** | **51** | **259** | **115** |

## External dependencies and contract questions

| Id | Needed from | What | Interim | Adopted by |
|---|---|---|---|---|
| CQ-1 | `-restapi` | Tag a release holding `api/openapi.yaml` 1.x and `api/contract/*.json`; merge `feat/restapi-feature-complete` to `main` | Snapshot of `747a484` (plan.md §5) | M6-U1 (or the milestone exit then running) |
| CQ-2 | `-restapi` | `ApiKey` has no `version` but `DeleteApiKey`/`DeleteServiceApiKey` require `If-Match` (research.md F-2) | SDK sends `If-Match: "1"` for schemas without `version` (one table entry) | M0-C6 interim; removed by M6-U1 when fixed |
| CQ-3 | `-restapi` | `IfMatchPut` description ("required when the resource exists") vs CD-2 ("optional on PUT") (F-3) | SDK behaviour correct under both (M0-C6) | M6-U1 verifies |
| CQ-4 | `-restapi` | Document `Me.servicePermissions` in contract §5 (F-1) | `can()` reads it when present | M0-D1 |
| CQ-5 | root (J) | OQ-W1 mockups for S10, S11, T14, T15; T7 in root IA | S2 table pattern; T7 in nav (WD-13) | M6-Q2 approvals |
| CQ-6 | root (J) / `-restapi` | OQ-W8: agent *Logs* tab has no log-read operation | Tab shows log destinations + CLI (WD-29) | M2-A5 |
| CQ-7 | platform, IdP admins | Dev environment, seeded users, IdP SPA registrations, CloudFront | Fake API and fake IdP in gated e2e | `e2e:dev` (not gated) |
| CQ-8 | `-restapi` | `Team` and the service reports carry no agent count (S2 *Agents* column, S1 total) | S2 shows "—"; S1 counts from `ListAgents` (CQ-10) | M2 exit |
| CQ-9 | `-restapi` | `Team` has no cluster name or IAM role ARN (T1) | "—"; ARN from a `team_shared` agent | M2 exit |
| CQ-10 | `-restapi` | No per-team agent count or health aggregate (S1) | `ListAgents` for the first 50 active teams | M2 exit |
| CQ-11 | `-restapi` | No reconciler-health endpoint; `/readyz` check names undocumented (S1) | `reconciler` check, else overall status | M2 exit |
| CQ-12 | `-restapi` | Identity provider client secret is an ARN only; the task list expects a write-only value (S10) | ARN field, no `SecretInput` | M2 exit |

---

## M0 — Foundations

Goal: pinned contract, generated SDK with its core, console domain, sign-in, shell, UI kit, fake API
harness and hosting config. **S runs first and alone.** Then G, D, U, W, E1–E3 in parallel; C starts with
G (C1–C5, C7–C9 need only the table shape from G1, C6 needs G3); A after U8 for A7; P after C and G; H
after D, U and A; E4–E5 last. Merge order: S, G, C, P, D, U, W, A, H, E.

### M0-S · Bootstrap (serial, first)

Owns: root `package.json`, `packages/sdk/package.json`, `apps/console/package.json`, `bun.lock`,
`biome.json`, `tsconfig*.json`, `**/vitest.config.ts`, `.github/workflows/ci.yml`, `packages/sdk/contract/`,
`packages/sdk/tools/contract-sync.ts`, `architecture.test.ts`, the shared lists of architecture.md §3.2
(created with placeholders), `presentation/routes/NotBuiltYet.tsx`, `AGENTS.md`, `docs/technical-details.md`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-S1 | Add the dependencies of architecture.md §8 at exact versions (latest stable, ≥ 2 weeks old); prove each runs under TypeScript 7 and Bun 1.4 (a smoke import test per package); record versions in `docs/technical-details.md` | SDK-9 (part), NFR-7, WD-9 | — |
| [x] | M0-S2 | Contract snapshot: copy `openapi.yaml`, `permissions.json`, `operations.json` from `-restapi` `747a484` into `packages/sdk/contract/`; `contract.lock.json`; `tools/contract-sync.ts` with `contract:check` (sha256 compare; test: a changed byte fails) and `contract:update --ref` (fetch via GitHub raw, rewrite lock, run codegen, print op/schema diff; tested with a fake fetch) | SDK-1 (part), WD-2, plan.md §5 | M0-S1 |
| [x] | M0-S3 | Pre-create every shared list (architecture.md §3.2) with placeholders and `NotBuiltYet`; extend `architecture.test.ts`: `domain`/`application` reference no `window`, `document`, `fetch` or storage; only `infrastructure/storage/` touches `localStorage`/`sessionStorage`/`indexedDB`; `presentation` imports no `oauth4webapi`; a red test per new rule | WEB-18 (part), NFR-6, WD-18 | M0-S1 |
| [x] | M0-S4 | Gate and CI: `bun run gate` = frozen install, `contract:check`, `codegen:check`, lint, typecheck, `test:cover` (≥ 90% lines/branches on `domain` and `application`), build, `size`, `tsdoc`; Vitest setup that throws on any unmocked `fetch`; CI jobs: gate, SDK runtime matrix (Node 22, Bun, Chromium), Playwright (chromium + smoke firefox/webkit) with report artifacts | WEB-US-1.6 (part), WEB-US-4.3 (part), NFR-7 | M0-S2 |
| [x] | M0-S5 | `AGENTS.md`: replace the "use `VITE_*` config" checklist line with runtime `config.json` (D43); add `contract/`, `tools/`, `e2e/`, `deploy/` to the layout; `docs/technical-details.md` toolchain and scripts | FR-034, WD-19 | M0-S4 |

### M0-G · Code generation (SDK)

Owns: `packages/sdk/tools/codegen/` (incl. the shared list `emitters.ts`), `packages/sdk/src/generated/` (output), `packages/sdk/src/generated.coverage.test.ts`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-G1 | Loader: parse the snapshot with `yaml`, resolve `$ref`s, build `OperationIR[]` (data-dictionary §2) incl. `x-afs-sdk` namespace parse, `ifMatch`, `idempotencyKey`, `csv`, success statuses and content types; tests assert 182 ops, method counts (79/44/26/17/16), 8 CSV ops, 43 required `If-Match`, every `POST` with `Idempotency-Key` | SDK-1 | M0-S2 |
| [x] | M0-G2 | Schema emitter: one type per component schema; inline enums opened (`(string & {})`); `readOnly` → `readonly` and omitted from `XInput`; `Money` branded string; nullable `oneOf`; TSDoc from `description`; golden tests on representative schemas (`Team`, `Budget`, `Me`, `ResourceStatus`, `WorkOrderRepo`); type test: no money field is `number` | WEB-US-5.1 (part), WEB-US-5.2 (part), SDK-10, WD-3 | M0-G1 |
| [x] | M0-G3 | Operation table emitter with readers (research.md §3: same-path `GET`, else parent list with match on `id`/`name`/`key`, `host`+`repo` for `UpdateWorkOrderRepo`) and `secretFields` (derived + `secret-fields.ts`); tests: all 43 `If-Match` ops have a reader; a secret-looking request property not in the list fails | WEB-US-1.2 (part), WEB-US-6.1 (part), SDK-4, SDK-11, WD-6 | M0-G1 |
| [x] | M0-G4 | Resource module emitter (42 modules) and `createAfs` facade per the signature rule (architecture.md §2.2): positional path params, `Versioned` last param on `If-Match` ops, `Paginated` for lists, `void` for `204`, `string` for kubeconfig, `ReportCall` for CSV ops; `expectTypeOf` tests on sample calls | SDK-1, SDK-3, WD-4, WD-5 | M0-G2, M0-G3, M0-C1 |
| [x] | M0-G5 | `codegen:check` (regenerate in memory, diff `src/generated/`); coverage test reading `openapi.yaml` and `operations.json` independently of the generator: fails on an `operationId` without a method (incl. `GetHealth` → `health.get()`) or a method not in the table | WEB-US-1.1, SDK-1 | M0-G4, M0-C10 |

### M0-C · SDK core

Owns: `packages/sdk/src/core/`, `packages/sdk/src/index.ts`, `packages/sdk/src/testing/` (test helpers, not exported); removes `src/client.ts`, `src/errors.ts`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-C1 | Transport: URL building (encoded path params, query), `Accept`, JSON body, `X-Request-Id` from `requestId` option (> 64 chars → `TypeError` before sending), `ResponseMeta` (status, requestId, etag, contractVersion, idempotentReplayed) as non-enumerable `meta`; unknown fields kept but ignored; `204` → void; `text/csv` and `application/yaml` bodies as strings | WEB-US-5.3, WEB-US-5.2 (part), WEB-US-5.4 (part), SDK-10 | M0-G1 |
| [x] | M0-C2 | `AfsError`: open `code`, `status`, `requestId`, `details`, `toJSON()`, ten getters; a non-JSON error body (e.g. `502` HTML) → `code: "InternalError"`, message ≤ 200 chars; `428` → `isPreconditionRequired`; table test: each code sets its getter and no other; unknown `"NewCode"` kept | WEB-US-1.5, WEB-US-1.3 (part), WEB-US-5.4 (part), SDK-5 | M0-C1 |
| [x] | M0-C3 | Auth: `bearer(supplier)` and `apiKey("afsk_…")`; latest token per request; on `401` call supplier once with `forceRefresh: true` and retry once; second `401` throws `isUnauthenticated`; never a third attempt; API key never calls a supplier | WEB-US-2.1, WEB-US-2.2, WEB-US-2.3, SDK-2 | M0-C1 |
| [x] | M0-C4 | Retry: full jitter (`random(0, min(cap, base·2^n))`, base 200 ms, cap 5 s, 3 retries, configurable, injectable random/sleep); `429` honours `Retry-After`, > 30 s → throw `isThrottled` at once; `503` up to 3 retries then `isUnavailable` with the last `requestId`; network errors only for `GET`/`PUT`/`DELETE`/`POST`+key; `400`, `401` (after refresh), `403`, `404`, `412`, `428` never retried; `PATCH` network error not retried; abort during backoff rejects ≤ 50 ms and sends nothing more | WEB-US-3.1, WEB-US-3.2, WEB-US-3.5, WEB-US-3.6, SDK-6 | M0-C2 |
| [x] | M0-C5 | Idempotency: `Idempotency-Key` (`crypto.randomUUID()` or `idempotencyKey` option) on every create and `:verb`, identical on every attempt; `409 idempotency_in_progress` waits `Retry-After` (1 s) and retries with the same key; any other `409` throws `isConflict` at once; `Idempotent-Replayed: true` → `meta.idempotentReplayed` | WEB-US-3.3, WEB-US-3.4, SDK-4 | M0-C4 |
| [x] | M0-C6 | Concurrency: `Versioned` → `If-Match: "<version>"`; id-only `PATCH`/`DELETE` reads first through the op's reader (GET or list scan) and sets `meta.appliedToVersion`; `PUT` sends `If-Match` when a version is held, id-only `PUT` with a reader reads first (absent → none), F-3; schema without `version` → `"1"` (CQ-2 interim, one table entry); test: no `PATCH`/`DELETE` ever leaves without `If-Match`; `412` → `isPreconditionFailed` | WEB-US-1.2, WEB-US-1.3, SDK-4, WD-7 | M0-C2, M0-G3 |
| [x] | M0-C7 | Pagination: `Paginated<T>` async iterator following `nextToken` until absent (one request per page), `.pages()` yielding `{items, nextToken, meta}`, `.first()`, `maxResults`/`nextToken` options | WEB-US-1.4, SDK-3 | M0-C1 |
| [x] | M0-C8 | Contract version: compare `X-Afs-Contract-Version` with generated `CONTRACT_VERSION` (semver); newer → `meta.contractVersion` and `onContractMismatch` called once per client | WEB-US-5.5 (part), SDK-10, D47, WD-8 | M0-C1 |
| [x] | M0-C9 | Secret hygiene and debug hook: `onDebug` events carry headers with `Authorization: [redacted]` and never a body; `AfsError` `message`, `details`, `toJSON()` never contain the token or a request body; `secretFields` values never in errors, debug events or retry diagnostics; the SDK holds no reference to `secretKey` or secret values after resolving (heap-reference test via the test hook); replayed `CreateApiKey` → `secretKey` `undefined`, `idempotentReplayed` true | WEB-US-2.4, WEB-US-6.1, WEB-US-6.2, SDK-11 | M0-C3, M0-C5, M0-G3 |
| [x] | M0-C10 | Public surface: `src/index.ts` exports `AfsClient`, `createAfs`, every module factory, errors, auth providers, types; `health.get()`/`getReadiness()` replace `AfsClient.health()`; `src/testing/fakeFetch.ts` used by every SDK test (route table, recorded requests); version `0.1.0` | WEB-US-1.6, SDK-9 (part) | M0-C1..C9, M0-G4 |
| [x] | M0-C11 | CSV calls: `ReportCall.asCsv()` on the 8 CSV ops sends `Accept: text/csv`, follows `X-Afs-Next-Token` across pages and keeps one header row; body otherwise byte for byte | WEB-US-4.2 (part), SDK-8 (part), D39 | M0-C1 |

### M0-P · SDK packaging and quality

Owns: `packages/sdk/tools/size-check.ts`, `packages/sdk/tools/tsdoc-check.ts`, `packages/sdk/test/` (contract replay, tree-shake, runtime matrix), `packages/sdk/tsconfig.build.json`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-P1 | ESM-only build, `sideEffects: false`, `exports` map; tree-shake test: a Vite library build of a file importing only `AfsClient` and `teams` contains no marker string of any other module | WEB-US-4.4 (part), SDK-9 | M0-C10 |
| [x] | M0-P2 | `size:sdk`: core ≤ 25 KB gzip and each of the 42 modules ≤ 3 KB gzip; CI fails above | WEB-US-4.4 (part), NFR-2 | M0-P1 |
| [x] | M0-P3 | `tsdoc`: reads emitted `dist/*.d.ts`, fails on any export reachable from `src/index.ts` without a preceding TSDoc block; generated code carries TSDoc from OpenAPI summaries | WEB-US-4.5, SDK-9 | M0-P1 |
| [x] | M0-P4 | Runtime matrix: the same SDK suite under Node 22 (`vitest`), Bun 1.4 (`bun --bun vitest`) and Chromium (Vitest browser mode, Playwright provider) | WEB-US-4.3, SDK-9 | M0-C10 |
| [x] | M0-P5 | Contract replay: each of the 170 OpenAPI response examples is served by the fake fetch to its SDK method and parsed without error; money examples stay strings; `-restapi`'s `permissions.json` checksum matches the lock | WEB-US-5.1, WEB-US-5.2 (part), PRD §8 | M0-C10 |

### M0-D · Console domain

Owns: `domain/` (replaces `permission.ts` and its test).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-D1 | `me.ts`: `Me`/`MeTeam` (contract §5 + `servicePermissions`, F-1); `can(me, permission, teamId?)`; table tests for every role allowed and denied, incl. security operator and service admin allowed `teams:read-directory` and team-admin, viewer and team API key denied | WEB-US-8.1, WEB-4, CQ-4 | M0-S1 |
| [x] | M0-D2 | `permission.ts`: the 58-permission catalog with four roles and conditional grants; `requiredRoleLabel()`; drift test against `packages/sdk/contract/permissions.json` (every permission, role and condition) | WEB-US-8.3, WEB-4 | M0-S2 |
| [x] | M0-D3 | `status.ts`: §4.2 vocabulary and dots (never `Running`, `Healthy`, `Blocked (cap)`; unknown phase passes through grey); `PollPolicy` (5 s up to 2 min for Pending/Reconciling, then 30 s; Degraded 30 s; Ready/Failed stop; hidden stop; `Retry-After` floor); `generationNote(generation, observed)` | WEB-US-9.1 (part), WEB-US-9.2 (part), WEB-US-9.6 (part), WEB-7, D24, W-1 | — |
| [x] | M0-D4 | `navigation.ts`: every IA item of PRD §4.1 (incl. T7 at *Configuration › Configuration values*, WD-13) with screen id, route and `visibleWhen`; tests: team roles never see Governance or Platform; viewer never sees *API keys*; *Pools & stages* only for ephemeral teams; S10 absent for team-admins | WEB-US-8.5 (part), WEB-US-8.7 (part), WEB-US-20.8 (part), WEB-18 | M0-D1 |
| [x] | M0-D5 | `money.ts` (scaled-`bigint` decimal compare/add/percent/format, never `Number`), `names.ts` (name regex, credential-like config names), `labels.ts` (enum → label, unknown passthrough), `time.ts` (browser time zone, UTC on hover text) | SDK-10 (console), PRD §2 non-goals | — |
| [x] | M0-D6 | `search.ts`: filter over a `SearchIndex` from ≥ 2 characters, ≤ 10 matches grouped by type, stable order | WEB-US-8.8 (part), D44 | — |

### M0-U · UI kit

Owns: `presentation/components/`, `presentation/styles/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-U1 | Design tokens and base styles from the mockup CSS (research.md §5) as CSS modules: palette, Open Sans 14 px, header 40 px, side nav 232 px, role pill colours; contrast test (tokens meet AA) | WEB-5 (part), WEB-US-42.2 (part), WD-18 | M0-S1 |
| [x] | M0-U2 | `Button` (primary, normal, link; `disabledReason` → focusable tooltip "Requires <role>"), `Tooltip`, `ActionsMenu` (APG menu button) | WEB-3 (part), WEB-US-36.1 (part) | M0-U1 |
| [x] | M0-U3 | `Table`: text filter, property filters, server pagination (`maxResults`/`nextToken`; an expired or refused token → restart from page 1 with a notice), preferences (page size, columns) through `PreferencesPort`, selection, sorting, empty/loading/error states | WEB-5 | M0-U1 |
| [x] | M0-U4 | `StatusIndicator` (dot + word from `domain/status`), `Alert` (request id with copy button), `Banner`, `LiveRegion` (polite announcements of status changes) | WEB-US-10.3, WEB-US-9.1 (part), WEB-US-42.1 (part), WEB-11 | M0-U1, M0-D3 |
| [x] | M0-U5 | `Modal`, `ConfirmDialog` (optional note), `TypeToConfirm`, `OneTimeSecretDialog` (*Copy*, warning, value only in a ref, cleared on close) | WEB-US-11.3 (part), WEB-8 | M0-U2 |
| [x] | M0-U6 | `Wizard` (steps, *Next* disabled until the step is valid, review step) and `FormField` (label, hint, error from `ValidationError.details.fields[]`) | WEB-5, WEB-US-14.1 (part) | M0-U2 |
| [x] | M0-U7 | `Tabs` (APG), `PageHeader` (title, *Info*, right-aligned actions, one primary), `Breadcrumbs`, `KeyValue`, `CopyButton`, `Badge` (*Unmetered*, *Template retired*), `DiffView` | WEB-5 | M0-U1 |
| [x] | M0-U8 | `SecretInput` (uncontrolled, masked, `autocomplete="off"`, value read by ref at submit, cleared on submit/cancel/error, registry for session clear) and `CliPreview` (renders a `CliCommand`) | WEB-US-11.2, WEB-6 (part), WEB-8 | M0-U2 |
| [x] | M0-U9 | axe-core component helper and keyboard tests for every component (focus order, Escape, arrow keys in menus and tabs) | WEB-US-42.1 (part), WEB-10, NFR-8 | M0-U2..U8 |

### M0-W · Hosting and build

Owns: `apps/console/vite.config.ts`, `apps/console/index.html`, `apps/console/public/config.json`, `apps/console/deploy/`, `apps/console/tools/size-console.ts`; removes `apps/console/.env.example` and `main/config.ts`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-W1 | Vite: hashed asset names, no inline script, CSS modules, browser targets (last 2 majors), `mode=e2e` compiles the test-only debug hook, drop `VITE_AFS_ENDPOINT`; local `public/config.json` | FR-034, FR-037, NFR-3 | M0-S1 |
| [x] | M0-W2 | `deploy/`: `response-headers-policy.json` (CSP of FR-037 with placeholders + `frame-src <issuers>` per WD-30, HSTS, `no-referrer`, `nosniff`), `cache-behaviors.json`, `config.schema.json`; `build-output.test.ts` (no inline script, hashed assets, `index.html` refs only hashed files) | FR-036, FR-037, FR-038, WD-19 | M0-W1 |
| [x] | M0-W3 | `size:console`: initial route ≤ 300 KB gzip; in the gate | NFR-1 | M0-W1 |

### M0-A · Sign-in, session and runtime config

Owns: `infrastructure/auth/`, `infrastructure/config/`, `infrastructure/storage/`, `application/ports/{auth,preferences,config}.ts`, `application/usecases/session/`, `presentation/screens/auth/` (sign-in, picker, callback, signed-out, configuration error).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-A1 | Runtime config: fetch `/config.json` with `cache: "no-store"`, validate (data-dictionary §6), defaults; missing or invalid → configuration error page, not a blank screen | FR-035, D43 | M0-W1 |
| [x] | M0-A2 | Providers: `ListSignInProviders` (fallback `providersFallback` on failure); one provider → straight to it; several → picker with the default preselected; remember the choice (provider id only) via `PreferencesPort` | WEB-US-7.1, WEB-2 | M0-A1 |
| [x] | M0-A3 | Deep links: `?provider=idp_…` skips the picker; `?teamId=` signs in with remembered/default provider and opens that team; a team not in `GetMe` → not-found page with *Sign in with another provider*, never confirming existence | WEB-US-7.2, WEB-US-7.3, WD-14 | M0-A2, M0-H1 |
| [x] | M0-A4 | OIDC with `oauth4webapi`: PKCE `S256`, `state`, `nonce`; verifier in `sessionStorage` only until the callback, then removed; wrong `state` or `nonce` refused with an error page; URL cleaned after callback | WEB-US-7.4, WEB-2 | M0-A2 |
| [x] | M0-A5 | `TokenStore` in memory only (access, ID, refresh); SDK `bearer` supplier with `forceRefresh` (refresh grant); unit test: no storage API is called with a token | WEB-US-7.5 (part), WEB-2 | M0-A4 |
| [x] | M0-A6 | Silent renew 60 s before expiry, computed from `expires_in` (clock-skew safe) (refresh token, else hidden-iframe `prompt=none`, WD-30); reload runs top-level `prompt=none` and returns to the same route without the IdP page | WEB-US-7.6 (part) | M0-A5 |
| [x] | M0-A7 | Session expired: a `401` that survives the SDK refresh shows "Your session has expired", keeps route and non-secret drafts (in-memory `DraftStore`), clears every registered `SecretInput`, re-authenticates and restores | WEB-US-7.7 | M0-A5, M0-U8 |
| [x] | M0-A8 | Sign out: clear tokens and the query cache, `BroadcastChannel("afs-session")` signs out other tabs, provider end-session with `id_token_hint`, land on `/signed-out` | WEB-US-7.8 (part) | M0-A5 |
| [x] | M0-A9 | Idle sign-out after `idleTimeoutMinutes` (default 60) without activity (fake clock tests) | WEB-US-7.9, WD-16 | M0-A8 |

### M0-H · Shell, routing and caller identity

Owns: `presentation/shell/`, `presentation/routes/` (except `registry.tsx` lines), `presentation/search/` (except `sources.ts` lines), `presentation/AppContext.tsx`, `application/errors.ts`, area files: `me`, `infrastructure/sdk/client.ts`, `infrastructure/sdk/errors.ts`, `main/main.tsx`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-H1 | Router from `navigation.ts` + `registry.tsx`; `NotFoundPage` for unknown routes and for teams/resources the caller cannot see; viewport < 1024 px notice; test: every nav item resolves to a route and a registered screen, every route has a screen | WEB-US-8.7, WEB-18 | M0-D4, M0-S3 |
| [x] | M0-H2 | `application/errors.ts` (AppError kinds) and `infrastructure/sdk/errors.ts` (AfsError → AppError, keeping `requestId`, `details.fields`, `requiredPermission`, `reason`); SDK client built with the OIDC supplier and `onContractMismatch` | WEB-11 (part), WEB-3 (part) | M0-C10, M0-A5 |
| [x] | M0-H3 | `GetMe` use case and adapter; fetched at sign-in, on window focus when older than 5 min, and after any `AccessDenied` (W-2); a boot-time failure shows a full-page "AFS is not responding" with *Retry* | WEB-US-8.4, W-2 | M0-H2 |
| [x] | M0-H4 | Global header: brand, environment name, identity menu with *Sign out*, role pill (orange service admin, blue team-admin, grey viewer, *Security operator*) and team | WEB-US-8.5 (part), WEB-3 | M0-H3, M0-U1 |
| [x] | M0-H5 | Side navigation filtered by `visibleWhen(me, team)`; breadcrumbs from routes | WEB-US-8.5 (part), WEB-US-8.7 (part), WEB-5 | M0-H1, M0-H3 |
| [x] | M0-H6 | Team switcher: exactly the teams in `GetMe`; *All teams* for service admins | WEB-US-8.6 | M0-H3 |
| [x] | M0-H7 | Header search: `/` focuses it; sources from `search/sources.ts` (teams in M0; agents, pools, work orders added by their streams) using list calls only; ≤ 10 grouped matches; Enter opens | WEB-US-8.8 (part), WEB-5, D44 | M0-D6, M0-H5 |
| [x] | M0-H8 | Access-denied alert naming `details.requiredPermission` with the request id, for any call | WEB-US-8.9, WEB-3 | M0-H2, M0-U4 |
| [x] | M0-H9 | Contract notice: dismissible "A newer version of AFS is available; reload" when the SDK reports a mismatch | WEB-US-5.5 (part), D47 | M0-H2 |
| [x] | M0-H10 | No-access page (CD-10): a principal with no team binding and neither service role sees "No access yet" with *Sign out*; the console never calls `ListTeams` or service routes for them | WEB-3, WD-27 | M0-H3 |

### M0-E · E2E harness

Owns: `apps/console/playwright.config.ts`, `e2e/` (core: `fake-afs/server.ts`, `fake-afs/idp.ts`, `fake-afs/users.ts`, `helpers/`, `visual/report.ts`), `e2e/specs/auth/`, `e2e/specs/shell/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-E1 | Fake AFS API (Bun): fixtures per area via `fixtures/index.ts`, each body validated against the pinned OpenAPI at load; principal from bearer token; `If-Match` (`412`/`428`), `Idempotency-Key` (replay, `409`), `429`/`503` injection; `X-Request-Id`, `X-Afs-Contract-Version`, CORS headers of FR-038; request recorder | FR-038, plan.md §4 | M0-S2 |
| [x] | M0-E2 | Fake OIDC IdP: discovery, authorize (auto-consent per seeded user: `svc-admin`, `team-admin`, `viewer`, `sec-op`), token (refresh rotation), JWKS, `prompt=none`, end-session | WEB-2 (part) | M0-E1 |
| [x] | M0-E3 | Playwright config and helpers: projects (chromium; firefox/webkit smoke; `dev` opt-in), axe helper (serious/critical fail), visual helper (1440 × 900, scale 2, 0.5%), sentinel scanner (query + mutation cache via e2e hook, storages, cookies, URL, history, console, telemetry requests, DOM), mutating-request and per-interval request counters; `visual/report.ts` side-by-side mockup vs snapshot HTML artifact | WEB-US-42.2 (part), W-3, WD-10, WD-11 | M0-E1 |
| [x] | M0-E4 | Sign-in e2e: after sign-in no token in `localStorage`, `sessionStorage`, IndexedDB, cookies or URL; reload returns to the same route without the IdP page; sign-out in one tab signs out a second tab and lands on `/signed-out`; picker and deep links | WEB-US-7.5, WEB-US-7.6 (part), WEB-US-7.8 (part), WEB-US-7.1 (part) | M0-A9, M0-H1, M0-E2, M0-E3 |
| [x] | M0-E5 | Shell e2e per seeded user: navigation per role, team switcher, search sends no request other than its list calls, auth/system pages axe-clean; visual baselines for sign-in and not-found | WEB-US-8.5 (part), WEB-US-8.8 (part), WEB-US-42.1 (part) | M0-H7, M0-E3 |

### M0-X · Exit

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M0-X1 | Merge in order; `bun run gate` and CI green; compare the lock's sha256 with `-restapi`'s current `api/openapi.yaml` and re-pin if it moved (plan.md §5); `@afs/sdk` `0.1.0`; ADR-005.. drafted from WD-2..WD-11; status, dashboard | plan.md §5 | all M0 |

---

## M1 — Teams & access

Goal: the query, polling and conflict layer, CLI previews, `waitFor`, telemetry, and S1–S3, T1, V1, T6,
S10 (settings, identity providers), T15 (audit, revisions). First wave Q, L, K, Y; second wave T, O, M,
D, N, H (start T first). Merge order: Q, L, K, Y, T, O, M, D, N, H.

### M1-Q · Query, polling and conflict layer

Owns: `presentation/query/`, `presentation/hooks/{useVersionedForm,useSecretMutation}.ts`, `presentation/shell/GlobalBanners.tsx`, `presentation/components/GenerationNote.tsx`, `presentation/components/WidgetBoundary.tsx`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-Q1 | `QueryClient` setup, key conventions, global error routing: `AccessDenied` → alert + `GetMe` refetch; `Unavailable`/network after retries → "AFS is not responding" banner with *Retry*, open forms keep non-secret values; `409 team_suspended` → "Team is suspended" | WEB-US-10.2, NFR-4 | — |
| [x] | M1-Q2 | `usePolledQuery`: interval from `PollPolicy` over every phase the page shows; stops on Ready/Failed; Degraded 30 s; no request while the tab is hidden, one refresh on return | WEB-US-9.2, WEB-US-9.3, WEB-7 | M1-Q1 |
| [x] | M1-Q3 | List polling: a list with 50 Pending rows sends one list request per interval, not one per row (fake timers + request count) | WEB-US-9.4, WD-21 | M1-Q2 |
| [x] | M1-Q4 | `ThrottleGate`: any `429` with `Retry-After: 10` suppresses polling for 10 s; non-blocking "Slowing down" notice | WEB-US-9.5, NFR-4 | M1-Q2 |
| [x] | M1-Q5 | `useVersionedForm`: `412` → "This changed since you opened it" with *Reload*; the user's edits stay visible beside the reloaded values; resubmit uses the new version | WEB-US-10.1, WEB-11 | M1-Q1 |
| [x] | M1-Q6 | `useSecretMutation` (no `useMutation`, variables never cached, `gcTime: 0` for the result, secret fields scrubbed); `GenerationNote` ("Generation N, observed M"; "Change not applied yet" while `M < N`) | WEB-US-9.1, WEB-US-11.1 (part), WEB-8, WD-31 | M1-Q1 |
| [x] | M1-Q7 | `WidgetBoundary`: a failing widget shows its own error with request id and *Retry* without blanking the page | NFR-4 | M1-Q1 |

### M1-L · CLI previews

Owns: `packages/sdk/tools/codegen/emit-cli-table.ts`, `domain/generated/cliOperations.ts` (output), `domain/cli.ts`, `domain/cli.golden/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-L1 | Emit a CLI table (operationId → `x-afs-cli` service and operation, flag name per path/query/body field in kebab-case, list and JSON fields, secret fields) into `domain/generated/`; part of `codegen:check` | WEB-6, WD-17 | — |
| [x] | M1-L2 | `CliCommand` builder and `render()`: `--kebab-case` flags, space-separated lists, JSON for objects, shell quoting; secret fields render `file://<path>` placeholders (create-secret → `--secret-value file://<path>`), never the value | WEB-US-11.4, WEB-6 | M1-L1 |
| [x] | M1-L3 | Golden previews for every create form and action that shows a CLI command (CreateTeam, AddMember, CreateApiKey, CreateAgent, CreateSecret, CreatePool, ScalePool, CreateWorkOrder `--repos` forms, UpdateTeam guardrails) | WEB-US-14.1 (part), WEB-US-26.7 (part), WEB-6 | M1-L2 |

### M1-K · SDK `waitFor`

Owns: `packages/sdk/src/resources/wait.ts` (+ one export line in `src/index.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-K1 | `waitFor(resource, {until, timeoutMs, signal})`: polls the resource's status getter every 5 s for 2 min then 30 s; resolves when the phase is in `until` and `observedGeneration ≥ generation`; rejects with the status on `Failed`, on `Degraded` unless targeted, on `timeoutMs` (default 10 min) and on abort; size budget kept | WEB-US-4.1, SDK-7, W-1 | — |

### M1-Y · Telemetry

Owns: `infrastructure/telemetry/`, `application/ports/telemetry.ts`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-Y1 | Web Vitals (LCP, INP, CLS) and uncaught errors sent with `navigator.sendBeacon` to `telemetryUrl` when configured: route template (no ids, no query), build version, request ids only; tests prove no email, name, token, form value or secret value in any payload | NFR-5, WEB-US-11.1 (part), WD-15 | — |

### M1-T · Teams administration (S2, S3, team detail)

Owns: area files: `teams`; `presentation/screens/s2-teams/`, `presentation/screens/s3-create-team/` (incl. shared list `budgetStepVariants.ts`), `presentation/screens/team-admin/` (page + `tabs.ts`); search source line for teams.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-T1 | `TeamsPort`, SDK adapter and use cases: list, get, create, update (incl. guardrail fields), delete, suspend, resume, status, models list/put, tags get/put, service-tag list for S3 | WEB-US-13.1 (part) | M1-Q1 |
| [x] | M1-T2 | S2 table: slug, kind, state, agent count, spend against budget (spend from `GetServiceReport` grouped by team, one call per page), cost center, expiry (ephemeral only); filters kind and state; `?view=budgets` columns | WEB-US-13.1, WEB-1 (part) | M1-T1 |
| [x] | M1-T3 | S2 *Actions*: *Suspend*, *Resume*, *Delete* (type the slug), *Set ceiling* (API `ValidationError` below the budget shown), *Raise ceiling temporarily* (amount, expiry, reason; row shows the override and when it ends) | WEB-US-13.2, WEB-US-13.3, D34 | M1-T2 |
| [x] | M1-T4 | S2 states: *Suspended*; after deletion *Deleted* with usage, cost and history links still readable; *Delete* only for service admins; team-admin or viewer opening `/teams` gets the not-found page | WEB-US-13.4, WEB-US-13.5 | M1-T2 |
| [x] | M1-T5 | S3 wizard: details, models and network, budget, members, review; *Next* gated per step; review shows everything and the CLI command; `budgetStepVariants.ts` list (P2 adds its line) | WEB-US-14.1, WEB-6 | M1-T1, M1-L3 |
| [x] | M1-T6 | S3 step 1 required service tags with allowed values as selects (cannot create without them); server `ValidationError` highlights named fields; sign-in provider select only with more than one provider, default chosen | WEB-US-14.2, WEB-US-14.3 | M1-T5 |
| [x] | M1-T7 | After *Create* the team appears in S2 as *Reconciling* and turns *Ready* without a reload | WEB-US-14.4, WEB-US-9.2 (part) | M1-T5, M1-Q3 |
| [x] | M1-T8 | Team detail page `/teams/:teamId/admin` (service admins) with `tabs.ts` for S6 and guardrails; summary panel | WEB-1 (part) | M1-T2 |
| [x] | M1-T9 | e2e for S2 and S3 (fake API), axe, visual baselines S2 (`02`) and S3 (`03`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M1-T3..T8 |

### M1-O · Team overview (T1, V1)

Owns: area files: `overview`; `presentation/screens/t1-overview/` (incl. shared list `cards.ts`), `presentation/shell/TeamLayout.tsx`, `presentation/hooks/useTeamWriteGate.ts`, `application/ports/workOrders.ts` (`listForTeam` only; M6-W extends).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-O1 | T1: namespace, cluster, IAM role ARN (copy), cost center, phase with conditions (type, status, reason, message, time), budget burn, agent health counts, recent activity; polled status | WEB-US-24.1, WEB-US-9.1 (part) | M1-T1, M1-Q2 |
| [x] | M1-O2 | *Models* tab (`/t/:teamId?tab=models`, DV-18): team's enabled models; edit only for service admins (`PutTeamModels`) | WEB-US-24.2 | M1-O1 |
| [x] | M1-O3 | *Work orders* card (`ListTeamWorkOrders`), read-only | WEB-US-24.3 | M1-O1 |
| [x] | M1-O4 | Suspended team: `TeamLayout` banner on every team page; `useTeamWriteGate` disables every mutating control except *Resume* and *Delete* with "Team is suspended"; a racing `409 team_suspended` shown as that message | WEB-US-24.4, WEB-US-24.6 | M1-O1 |
| [x] | M1-O5 | *Actions* *Suspend*/*Resume*; *Edit* display name, description, owner and sign-in provider (enabled providers), with `useVersionedForm` | WEB-US-24.5 | M1-O1, M1-Q5 |
| [x] | M1-O6 | V1 for viewers: information banner; *Edit*, *Actions*, *Create agent* disabled with "Requires team-admin" | WEB-US-36.1 (part) | M1-O1 |
| [x] | M1-O7 | e2e T1 and V1, axe, visual T1 (`06`) and V1 (`12`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M1-O2..O6 |

### M1-M · Members and API keys (T6)

Owns: area files: `members`, `apiKeys`; `presentation/screens/t6-members/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-M1 | *Members*: add people by email or IdP groups as team-admin or team viewer (no `service_admin`/`security_operator` choice; a crafted request's refusal shown); edit role, remove | WEB-US-29.1 | M1-Q1 |
| [x] | M1-M2 | *API keys*: create (name, role, expiry ≤ 90 days, default 30) via `useSecretMutation`; `secretKey` shown once in `OneTimeSecretDialog`; list shows prefix, role, expiry, last use; delete | WEB-US-29.2, WEB-US-11.3 (part) | M1-M1, M1-Q6 |
| [x] | M1-M3 | Viewer: membership controls disabled "Requires team-admin"; *API keys* tab not shown and its route not-found (D50) | WEB-US-29.3 | M1-M1 |
| [x] | M1-M4 | Team sign-in provider shown; team-admins change it among enabled providers | WEB-US-29.4 | M1-M1 |
| [x] | M1-M5 | Replayed `CreateApiKey` (no `secretKey`, `idempotentReplayed`): dialog says the key was created but cannot be shown again and offers *Delete key* | WEB-US-29.5, WEB-US-6.2 (part), D52 | M1-M2 |
| [x] | M1-M6 | e2e incl. sentinel `secretKey` from `CreateApiKey` absent everywhere after the dialog closes; axe; visual T6 (`11`) | WEB-US-11.1 (part), WEB-US-42.1 (part), WEB-US-42.2 (part) | M1-M2..M5 |

### M1-D · Service dashboard (S1)

Owns: area files: `dashboard`; `presentation/screens/s1-dashboard/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-D1 | Team and agent counts, month-to-date spend against the sum of budgets (service report), reconciler health, top 5 spenders linking to their teams; each widget in a `WidgetBoundary` | WEB-US-12.1 | M1-Q7 |
| [x] | M1-D2 | *Teams needing attention*: expiring within 7 days, budget ≥ 80%, *Budget blocked*, `Degraded` agents, reverted drift in 24 h, each with reason and link | WEB-US-12.2 | M1-D1 |
| [x] | M1-D3 | Warning banner when a team-day is over the variance threshold or price proposals are pending, with counts and links to S8 *Reconciliation* and S4 | WEB-US-12.3 | M1-D1 |
| [x] | M1-D4 | e2e, axe, visual S1 (`01`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M1-D1..D3 |

### M1-N · Service settings: shell, settings, identity providers (S10)

Owns: area files: `admin-settings`, `admin-identityProviders`; `presentation/screens/s10-settings/` (page + `tabs.ts`, `tabs/settings/`, `tabs/identity-providers/`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-N1 | S10 page (S2 table pattern), `/settings/:section` routes from `tabs.ts`; team-admins: not in navigation, routes not-found | WEB-US-20.8, WEB-16 | M1-Q1 |
| [x] | M1-N2 | *Settings*: every key from `GetSettings` with value, default, allowed range, last change; *Edit* validates the range client-side before `PutSetting` with `If-Match` | WEB-US-20.1 | M1-N1, M1-Q5 |
| [x] | M1-N3 | *Identity providers*: add, edit, disable Okta or Entra ID (issuer, client id, groups claim, console and CLI client ids, CD-9) and choose default; list teams using each; *Disable* disabled when in use, API `409` shown on a race; client secret through `SecretInput` and `useSecretMutation`, only its ARN shown | WEB-US-20.2, WEB-US-11.2 (part) | M1-N1, M1-Q6 |
| [x] | M1-N4 | e2e, axe, visual (S2 pattern; approval pending OQ-W1) for both tabs | WEB-US-42.1 (part), WEB-US-42.2 (part) | M1-N2, M1-N3 |

### M1-H · History: activity and revisions (T15)

Owns: area files: `audit`, `revisions`; `presentation/screens/t15-history/` (page + `tabs.ts`, `AuditFilters.tsx`, `tabs/audit/`, `tabs/revisions/`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-H1 | *Activity & audit*: actor, action, resource, outcome, request id; S5 filters (`AuditFilters`, reused by S5) as query parameters; *Download CSV* via `ListAuditEvents.asCsv()` | WEB-US-35.1, WEB-22 | M1-Q1 |
| [x] | M1-H2 | *Config revisions*: revisions per resource with author and time; selecting two shows a `DiffView` | WEB-US-35.2, WEB-22 | M1-Q1 |
| [x] | M1-H3 | e2e, axe, visual (S2 pattern; approval pending OQ-W1) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M1-H1, M1-H2 |

### M1-X · Exit

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M1-X1 | Merge; gate and e2e green; viewer session e2e over T1/V1/T6/T15 sends no mutating request; re-pin check (plan.md §5); `@afs/sdk` `0.2.0` (`waitFor`); status, dashboard | WEB-US-36.1 (part) | all M1 |

---

## M2 — Agents & secrets

Goal: T2–T4, T7, T9, T10, S7, V2 and S10 storage classes and agent templates. All streams start together;
C starts once A1's port lands (A1 first, merged early). Merge order: A, C, S, V, E, F, G.

### M2-A · Agents (T2)

Owns: area files: `agents`; `presentation/screens/t2-agents/` (table, detail panel, `panelTabs.ts`, `tabs/logs/`, `tabs/revisions/`; not `tabs/external-systems/`, which M2-E owns); search source line for agents.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M2-A1 | `AgentsPort` (list, get, create, update, delete, pause, resume, restart, status, snapshots list/create, templates list, storage classes list), adapter, use cases; merged first for M2-C | WEB-US-25.1 (part) | — |
| [x] | M2-A2 | Table: name, status (§4.2), model, template, bound secrets, month-to-date cost; no replica column and no *Scale* | WEB-US-25.1 | M2-A1 |
| [x] | M2-A3 | Detail panel: *Restart*, *Pause*/*Resume* (confirm), *Edit*, *Take snapshot*; polled status incl. *Budget blocked* | WEB-US-25.2, WEB-US-9.6 (part) | M2-A2 |
| [x] | M2-A4 | *Expand volume*: only a larger size; smaller refused client-side and the API's error shown | WEB-US-25.3 | M2-A3 |
| [x] | M2-A5 | Panel tabs list; *Logs* tab (log destinations and CLI, WD-29) and *Revisions* tab (`ListRevisions` filtered to the agent) | WEB-US-25.4 (part), CQ-6 | M2-A3 |
| [x] | M2-A6 | Viewer: same panel, every action disabled "Requires team-admin" | WEB-US-25.5 | M2-A3 |
| [x] | M2-A7 | `TemplateRetired=True` shown as *Template retired*; *Edit* asks for a new template or digest | WEB-US-22.3 (part) | M2-A3 |
| [x] | M2-A8 | e2e, axe, visual T2 (`07`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-A2..A7 |

### M2-C · Create agent (T3)

Owns: `presentation/screens/t3-create-agent/` (form, `sections/` reused by P4), `application/usecases/agents-create/`, `e2e/fake-afs/fixtures/createAgent.ts`, `e2e/specs/createAgent/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M2-C1 | Template (enabled only, defaults prefilled), image digest (template's allowed digests, current preselected), persona, model (team's only), resources, storage (size, class, on-delete, snapshots); no replica field; tag-only image → API `ValidationError` on the image field | WEB-US-26.1, WEB-US-22.2 (part), WEB-20 | M2-A1 |
| [x] | M2-C2 | Help panel: secrets and configuration arrive as env vars and files, no code change | WEB-US-26.2 | M2-C1 |
| [x] | M2-C3 | Secret bindings list only team shared secrets and this agent's own; env name or file path; env name already used by a configuration value blocked client-side and by the API | WEB-US-26.3, WEB-US-26.6 | M2-C1 |
| [x] | M2-C4 | *AWS identity*: shared or dedicated; with cross-account links, switching back is disabled "Remove cross-account roles first" | WEB-US-26.4 | M2-C1 |
| [x] | M2-C5 | Configuration values: *Use namespace value* only when the namespace has that name; effective value beside each name | WEB-US-26.5 | M2-C1 |
| [x] | M2-C6 | Side panel CLI command updating as the form changes | WEB-US-26.7, WEB-6 | M2-C1, M1-L3 |
| [x] | M2-C7 | e2e, axe, visual T3 (`08`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-C1..C6 |

### M2-S · Secrets (T4, V2)

Owns: area files: `secrets`; `presentation/screens/t4-secrets/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [x] | M2-S1 | `SecretsPort`, adapter, use cases; create, put value and rotate through `useSecretMutation` only | WEB-8 | — |
| [x] | M2-S2 | Create dialog: scope, name, description, optional external system, value (`SecretInput`); managed path previewed; value cleared after submit and never shown again | WEB-US-27.1, WEB-US-11.2 (part) | M2-S1 |
| [x] | M2-S3 | Table: scope, managed path, usage, rotation, last change; value column always "Write-only"; V2 for viewers: names, paths, usage, rotation, no value content | WEB-US-27.2, WEB-US-36.2 | M2-S1 |
| [x] | M2-S4 | *Rotate*: new value and a warning naming the agents that restart | WEB-US-27.3 | M2-S2 |
| [x] | M2-S5 | Delete a bound secret: API `409` with the agents, each linked | WEB-US-27.4 | M2-S3 |
| [x] | M2-S6 | CLI preview for create-secret shows `--secret-value file://<path>` | WEB-US-11.4 (part), WEB-6 | M2-S2, M1-L2 |
| [x] | M2-S7 | e2e: sentinel typed in create and rotate absent from every store, telemetry and DOM afterwards; V2 viewer read-only; axe; visual T4 (`09`) and V2 (`13`) | WEB-US-11.1 (part), WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-S2..S6 |

### M2-V · Configuration values (T7)

Owns: area files: `config`; `presentation/screens/t7-config/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M2-V1 | Namespace table (name, value, description, agents using) and agent table (source *Namespace*/*Agent value*, effective value) | WEB-US-30.1 | — |
| [ ] | M2-V2 | Credential-like names (`*password*`, `*secret*`, `*token*`, `*key*`) refused with a link to Secrets | WEB-US-30.2 | M2-V1 |
| [ ] | M2-V3 | Saving a namespace value warns which agents restart; deleting a value agents link to is refused with the agents listed | WEB-US-30.3 | M2-V1 |
| [ ] | M2-V4 | Viewers: both tables read-only | WEB-US-30.4 | M2-V1 |
| [ ] | M2-V5 | e2e, axe, visual T7 (`16`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-V1..V4 |

### M2-E · External systems, team and agent (T9, T10)

Owns: area files: `externalSystems`; `presentation/screens/t9-external-systems/`, `presentation/screens/t2-agents/tabs/external-systems/` (+ one line in `panelTabs.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M2-E1 | T9 switches with inherited state; a system off at a higher level shown off and disabled naming the level; *Unmetered* badge on unmetered LLM systems | WEB-US-32.1 | — |
| [ ] | M2-E2 | *Declare system* only when `mayAddExternalSystems`; declare, edit and delete team-declared systems | WEB-US-32.2 | M2-E1 |
| [ ] | M2-E3 | T10 agent tab: effective access with `disabledAt`; switching a system off for one agent shows *Off at agent level* within one polling interval | WEB-US-32.3 | M2-E1, M2-A5 |
| [ ] | M2-E4 | e2e, axe, visual T9 (`20`) and T10 (`21`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-E1..E3 |

### M2-F · External systems catalog (S7)

Owns: area files: `admin-externalSystems`; `presentation/screens/s7-external-systems/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M2-F1 | Built-in systems have no *Delete*; add, edit, delete custom systems with endpoints | WEB-US-18.1 | — |
| [ ] | M2-F2 | Service-level switch; teams then show *Off for all teams* | WEB-US-18.2 | M2-F1 |
| [ ] | M2-F3 | Enabling an *Unmetered* system needs a confirmation naming what is not counted or capped | WEB-US-18.3 | M2-F1 |
| [ ] | M2-F4 | Below the catalog: choose teams that may declare their own systems (`mayAddExternalSystems`) | WEB-US-18.4 | M2-F1 |
| [ ] | M2-F5 | e2e, axe, visual S7 (`19`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-F1..F4 |

### M2-G · Service settings: storage classes and agent templates (S10)

Owns: area files: `admin-storageClasses`, `admin-agentTemplates`; `presentation/screens/s10-settings/tabs/{storage-classes,agent-templates}/` (+ lines in `tabs.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M2-G1 | *Storage classes*: add, edit, remove, mark default; a class in use cannot be removed (`409` lists the agents) | WEB-US-20.3, WEB-16 | — |
| [ ] | M2-G2 | *Agent templates*: add and edit (name, description, harness, default resources, allowed digests with one current), enable/disable, revisions per template | WEB-US-22.1, WEB-US-20.4, WEB-20 | — |
| [ ] | M2-G3 | *Platform › Agent templates* opens `/settings/agent-templates` directly | WEB-20, WEB-18 (part) | M2-G2 |
| [ ] | M2-G4 | e2e, axe, visual (S2 pattern) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M2-G1..G3 |

### M2-X · Exit

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M2-X1 | Merge; gate and e2e green; viewer no-mutation e2e over every M1–M2 team screen; sentinel e2e over every M1–M2 secret flow; re-pin check; status, dashboard | WEB-US-36.1 (part), WEB-US-11.1 (part) | all M2 |

---

## M3 — Spend control

Goal: typed reports, charts, T5, S4, S8, T11, T12 and T14 notifications. K and C first (short), then B, P,
R, N. Merge order: K, C, B, P, R, N.

### M3-K · SDK reports

Owns: `packages/sdk/src/resources/reports.ts` (+ one export line in `src/index.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-K1 | `reports.team(teamId, kind, query)`, `reports.agent(...)`, `reports.service(kind, query)`: typed `rows`, `totals`, `notes` (`range`, `groupBy` incl. `tag:<key>`, filters); `.asCsv()` returns the body byte for byte (multi-page via M0-C11); size budget kept | WEB-US-4.2, SDK-8 | — |

### M3-C · Charts and report controls

Owns: `presentation/components/charts/`, `presentation/components/report-controls/` (RangePicker, GroupBy, filters).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-C1 | SVG bar, line and stacked bar charts with an accessible table alternative and keyboard focus per series; axe-clean | WEB-9, WEB-US-42.1 (part) | — |
| [ ] | M3-C2 | Range picker (24 h, 7, 30, 90 days, month to date, custom), filters and group by (incl. tag keys) producing the contract's report query | WEB-US-37.1 (part), WEB-9 | — |

### M3-B · Budget and usage (T5)

Owns: area files: `budgets`; `presentation/screens/t5-budget/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-B1 | Month-to-date spend, month-end forecast with projected cap date, action at exhaustion, latest reconciliation, daily spend split into Bedrock tokens and EKS compute, spend by agent | WEB-US-28.1 | M3-C1 |
| [ ] | M3-B2 | *Edit budget*: amount, thresholds, and (service admins, persistent teams only) action at exhaustion; an amount above the ceiling refused client-side naming the ceiling, and the API's `ValidationError` shown | WEB-US-28.2, D33 | M3-B1 |
| [ ] | M3-B3 | Team-admin: ceiling, override, quotas and *notify* not offered; the API's `403` shown if forced | WEB-US-28.3 | M3-B2 |
| [ ] | M3-B4 | Link to T14 *Notifications* where threshold alerts are delivered | WEB-US-28.4 | M3-B1 |
| [ ] | M3-B5 | e2e, axe, visual T5 (`10`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M3-B1..B4 |

### M3-P · Models and pricing (S4)

Owns: area files: `admin-models`, `admin-pricing`; `presentation/screens/s4-models/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-P1 | Models with effective-dated prices; pending proposals with old and new prices; *Approve*/*Reject* with confirmation and optional note; after success the row moves to price history with approver and time | WEB-US-15.1 | — |
| [ ] | M3-P2 | e2e, axe, visual S4 (`04`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M3-P1 |

### M3-R · Reports (S8, T11, T12)

Owns: area files: `reports`; `presentation/screens/s8-reports/`, `presentation/screens/t11-reports/` (incl. shared list `sections.ts`), `presentation/screens/t2-agents/tabs/usage/` (+ one line in `panelTabs.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-R1 | Report page core: controls (M3-C2), charts and table; *Download CSV* downloads exactly what the API returns for the same query | WEB-US-37.1, WEB-9 | M3-K1, M3-C1, M3-C2 |
| [ ] | M3-R2 | Activity views: working, idle and other states, utilization, *idle since* for idle agents | WEB-US-37.2 | M3-R1 |
| [ ] | M3-R3 | Every report shows the API's `notes` (incl. non-Bedrock spend); external traffic shows counts and bytes, never a cost; *Unmetered* notices | WEB-US-37.3, WEB-9 | M3-R1 |
| [ ] | M3-R4 | S8 *Reconciliation* tab (`/reports/reconciliation`, `ListCostReconciliations`) listing team-days over the threshold | WEB-US-37.4 | M3-R1 |
| [ ] | M3-R5 | A viewer of team A: S8 and other teams' reports absent from navigation; routes show not-found | WEB-US-37.5 | M3-R1 |
| [ ] | M3-R6 | T11 team tabs (budget and usage, activity, models, external systems) and T12 agent *Usage* tab (cost, calls, tokens, utilization, longest idle) | WEB-US-37.1 (part), WEB-US-37.2 (part) | M3-R1 |
| [ ] | M3-R7 | e2e, axe, visual S8 (`22`), T11 (`23`), T12 (`24`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M3-R1..R6 |

### M3-N · Notifications (T14)

Owns: area files: `notifications`; `presentation/screens/t14-delivery/` (page, `tabs.ts`, `tabs/notifications/`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-N1 | T14 page with two tabs (log delivery added in M4); *Notifications*: channels (Slack, email, webhook, Jira) with events and delivery status; create, edit, delete (channel credentials as secret references) | WEB-US-34.2 (part), WEB-21 | — |
| [ ] | M3-N2 | *Send test*: one test message; `200` shows delivered or the error; `202 pending` polls the channel status until reported (CD-3) | WEB-US-34.2 | M3-N1 |
| [ ] | M3-N3 | Deleting a channel used by a report schedule lists the schedules first | WEB-US-34.3 | M3-N1 |
| [ ] | M3-N4 | A failed delivery shows on the channel with its error | WEB-US-34.4 | M3-N1 |
| [ ] | M3-N5 | Viewers: create, edit, delete disabled "Requires team-admin"; the API's `403` for `CreateNotificationChannel` shown if forced | WEB-US-34.5 (part) | M3-N1 |
| [ ] | M3-N6 | e2e, axe, visual (S2 pattern; approval pending OQ-W1) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M3-N1..N5 |

### M3-X · Exit

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M3-X1 | Merge; gate and e2e green; viewer no-mutation e2e over M3 team screens; re-pin check; `@afs/sdk` `0.3.0` (reports); status, dashboard | WEB-US-36.1 (part) | all M3 |

---

## M4 — Production readiness

Goal: S5, S6, S9, T8 and team identities, T13, T14 log delivery, S11, report scheduling, T15 restore, S10
notification channels. All streams start together. Merge order: A, W, G, I, L, E, S, N.

### M4-A · Audit log (S5)

Owns: area files: `admin-audit`; `presentation/screens/s5-audit/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-A1 | Filters by team, actor, action, outcome (allowed, denied) and time range, sent as API query parameters (`AuditFilters` from M1-H) | WEB-US-16.1 | — |
| [ ] | M4-A2 | Denied requests show *Denied* with the permission required; drift corrections show *Drift corrected* with the object | WEB-US-16.2 | M4-A1 |
| [ ] | M4-A3 | *Download CSV*: `ListAdminAuditEvents` with `Accept: text/csv` for the same filters | WEB-US-16.3 | M4-A1 |
| [ ] | M4-A4 | e2e, axe, visual S5 (`05`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-A1..A3 |

### M4-W · Team AWS account access (S6)

Owns: area files: `admin-orgAccounts`; `presentation/screens/team-admin/tabs/aws-accounts/` (+ line in `tabs.ts`), `presentation/components/AwsAccountAccess.tsx` (reused by M4-I).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-W1 | Filter of glob patterns over account ids and names; matching organization accounts with the pattern that matched and agent link count per account | WEB-US-17.1 | — |
| [ ] | M4-W2 | A narrowing change: *Save* first shows which links will be disabled and asks to confirm | WEB-US-17.2 | M4-W1 |
| [ ] | M4-W3 | *Team manages its own accounts* switch editable by service admins only; the filter editable exactly when `teams:set-aws-accounts` is in the team's `permissions[]`, else read-only "Requires service admin"; forced call's `403` shown | WEB-US-17.3, WEB-US-8.2 | M4-W1 |
| [ ] | M4-W4 | e2e, axe, visual S6 (`18`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-W1..W3 |

### M4-G · Cost allocation tags (S9) and team tags (T13)

Owns: area files: `admin-serviceTags`, `tags`; `presentation/screens/s9-cost-tags/` (incl. shared list `sections.ts`), `presentation/screens/t13-tags/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-G1 | S9: system tags read-only; service tags add, edit, remove (fixed or required, allowed values, default); teams missing a required value listed with links | WEB-US-19.1 | — |
| [ ] | M4-G2 | Spend grouped by any tag key with *(untagged)* separate | WEB-US-19.2 | M4-G1, M3-R1 |
| [ ] | M4-G3 | One-time "activate cost allocation tags in AWS Billing" banner until a service admin acknowledges (`PutSetting billing.tag_activation_acknowledged`); team roles never see S9 (not-found) and its API `403` is handled | WEB-US-19.4, WEB-19 (part) | M4-G1 |
| [ ] | M4-G4 | T13: system, service and team tags with source; team-admins edit required values and their own tags; fixed and system tags read-only; viewers read-only | WEB-US-33.1 | — |
| [ ] | M4-G5 | T13 lists tags dropped from Bedrock request metadata (`requestMetadataDroppedKeys`, CD-6, D27) | WEB-US-33.2 | M4-G4 |
| [ ] | M4-G6 | e2e, axe, visual S9 (`25`) and T13 (`26`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-G1..G5 |

### M4-I · Agent AWS access (T8), identities

Owns: area files: `identity`; `presentation/screens/t2-agents/tabs/{secrets-identity,identities}/` (+ lines in `panelTabs.ts`), `presentation/screens/t8-identities/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-I1 | *Secrets & identity* tab: identity (shared or dedicated), role ARN, Pod Identity association, accounts the team may use | WEB-US-31.1 | — |
| [ ] | M4-I2 | *Add cross-account role* only for a dedicated identity; only accounts inside the team's filter; role ARN, profile name, max session length | WEB-US-31.2 | M4-I1 |
| [ ] | M4-I3 | Trust policy with generated external ID and *Copy*; *Pending trust* until *Verify now* succeeds → *Verified*, or *Failed* with the reason | WEB-US-31.3 | M4-I2 |
| [ ] | M4-I4 | Viewers: identity, links and trust policies read-only | WEB-US-31.4 | M4-I1 |
| [ ] | M4-I5 | *Identities* tab: external identities (AGT-5) with add and remove | WEB-US-25.4 (part) | — |
| [ ] | M4-I6 | Team view `/t/:teamId/identities`: every agent's identity and links, opening the agent's T8 tab; *AWS account access* section with `AwsAccountAccess` for team roles (WD-32) | WEB-1 (part), WEB-US-8.2 (part) | M4-I1, M4-W3 |
| [ ] | M4-I7 | e2e, axe, visual T8 (`17`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-I1..I6 |

### M4-L · Log delivery (T14)

Owns: area files: `logDestinations`; `presentation/screens/t14-delivery/tabs/logs/` (+ line in `tabs.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-L1 | Destinations (CloudWatch, S3, OTLP, Splunk HEC, Datadog) with status and last delivery; add, edit, delete; credentials chosen as secret references, never typed | WEB-US-34.1, WEB-21 | — |
| [ ] | M4-L2 | Viewers: controls disabled "Requires team-admin"; `CreateLogDestination` `403` shown if forced | WEB-US-34.5 (part) | M4-L1 |
| [ ] | M4-L3 | e2e, axe, visual (S2 pattern) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-L1, M4-L2 |

### M4-E · Export and import (S11)

Owns: area files: `admin-exports`; `presentation/screens/s11-export-import/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-E1 | *Create export* (`202`, polled progress); past exports with size, checksum and, when complete, the download link valid 7 days then shown expired (D49); note that bundles hold no secret values | WEB-US-21.1, WEB-17 | — |
| [ ] | M4-E2 | *Import*: bundle and account map; *Dry run* default showing the plan per resource; bundle over 100 MB refused client-side; *Apply* enabled only after a dry run of the same inputs (input hash) and asks to confirm | WEB-US-21.2, WEB-17 | M4-E1 |
| [ ] | M4-E3 | e2e, axe, visual (S2 pattern) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-E1, M4-E2 |

### M4-S · Report scheduling and revision restore

Owns: area files: `reportSchedules`; `presentation/screens/t11-reports/schedules/` (+ line in `sections.ts`), `presentation/screens/t15-history/tabs/revisions/restore/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-S1 | *Schedule report*: the team's own channels only, cadence daily/weekly/monthly; a `ValidationError` for a service-level channel shown on the channel field; schedules list next run, last run, last status with error | WEB-US-37.6, D23 | — |
| [ ] | M4-S2 | Viewers: *Schedule report* disabled "Requires team-admin" | WEB-US-37.7, D23 | M4-S1 |
| [ ] | M4-S3 | *Restore*: `RestoreRevision` with `dryRun` shows the plan (`RestoreResult`, CD-4, incl. skipped); *Apply* asks to confirm; viewers can view and diff but *Restore* is disabled | WEB-US-35.3, WEB-22 | — |
| [ ] | M4-S4 | e2e for scheduling and restore | WEB-US-42.1 (part) | M4-S1..S3 |

### M4-N · Service notification channels (S10)

Owns: area files: `admin-notificationChannels`; `presentation/screens/s10-settings/tabs/notification-channels/` (+ line in `tabs.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-N1 | Add, edit, delete the service's email, Slack, webhook and Jira channels; deleting the channel named in `work_orders.notification_channel_id` shows the API's `409` | WEB-US-20.7, WEB-16 | — |
| [ ] | M4-N2 | e2e, axe, visual (S2 pattern) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M4-N1 |

### M4-X · Exit

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M4-X1 | Merge; gate and e2e green; viewer no-mutation e2e over M4 team screens; re-pin check; status, dashboard | WEB-US-36.1 (part) | all M4 |

---

## M5 — Budgeted workloads and swarms

Goal: P2, P4, isolation tier, viewer kubectl, cost tag status. All streams start together. Merge order: E,
P, G, T.

### M5-E · Ephemeral team (P2)

Owns: `presentation/screens/s3-create-team/ephemeral/` (+ line in `budgetStepVariants.ts`), `presentation/screens/t1-overview/ephemeral/` (+ line in `cards.ts`), `e2e/specs/ephemeral/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M5-E1 | *Ephemeral* in S3 adds lifetime budget, expiry (≤ `teams.ephemeral_max_days`) and teardown rule to the budget step; *Next* disabled until all three are set; review shows them | WEB-US-38.1 | — |
| [ ] | M5-E2 | Teardown rule defaults to *at cap or expiry*; the step shows an estimated daily cost and the date the cap would be reached | WEB-US-38.2 | M5-E1 |
| [ ] | M5-E3 | Ephemeral team overview card: time to expiry, spend against cap, and after teardown when and why | WEB-US-38.3 | — |
| [ ] | M5-E4 | e2e, axe, visual P2 (`14`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M5-E1..E3 |

### M5-P · Pools and stages (P4)

Owns: area files: `pools`; `presentation/screens/p4-pools/`; search source line for pools.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M5-P1 | `PoolsPort` (26 operations), adapter, use cases | WEB-12 | — |
| [ ] | M5-P2 | Stages in order; pools with template, model, desired and reporting workers (working, idle, impaired), handoffs, storage, shared role and linked accounts, spend; polled | WEB-US-39.1, WEB-12 | M5-P1 |
| [ ] | M5-P3 | *Create pool*: T3 sections (template enabled only with allowed digests, image, model, secrets, configuration) plus workers 0–200, stage, handoffs, scratch 1–500 GiB, optional shared EFS | WEB-US-39.2, WEB-US-22.2 (part), WEB-20 | M5-P1 |
| [ ] | M5-P4 | Pool name checked against the team's agent and pool names; not editable after create | WEB-US-39.3 | M5-P3 |
| [ ] | M5-P5 | *Shared named role*: one role name linked in one or more accounts inside the team's filter only | WEB-US-39.4 | M5-P2 |
| [ ] | M5-P6 | *Scale* 0–200 with CLI command; *Pause*, *Resume*, *Delete* with confirmation | WEB-US-39.5, WEB-6 | M5-P2 |
| [ ] | M5-P7 | Viewers: every control disabled "Requires team-admin"; nav item absent for persistent teams; *Template retired* shown on pools | WEB-US-39.6, WEB-US-22.3 (part) | M5-P2 |
| [ ] | M5-P8 | e2e, axe, visual P4 (`27`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M5-P2..P7 |

### M5-G · Guardrails: isolation tier and viewer kubectl

Owns: `presentation/screens/team-admin/tabs/guardrails/` (+ line in `tabs.ts`), `presentation/screens/t1-overview/kubeconfig/` (+ line in `cards.ts`), `e2e/specs/guardrails/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M5-G1 | Service admins set isolation tier (*shared*/*dedicated*) and the viewer kubectl switch; both confirm and show the CLI command | WEB-US-23.1, WEB-14, WEB-15 | — |
| [ ] | M5-G2 | Team-admins and viewers: both disabled "Requires service admin"; a forced `UpdateTeam` `403` shown as access-denied | WEB-US-23.2 | M5-G1 |
| [ ] | M5-G3 | With kubectl on, T1 and V1 show *Download kubeconfig* (YAML from `GetTeamKubeconfig`, saved as a file) and `afs teams get-kubeconfig --team-id …`; off → neither shown | WEB-US-23.3, WEB-15, WD-28 | — |
| [ ] | M5-G4 | e2e for guardrails and kubeconfig | WEB-US-42.1 (part) | M5-G1..G3 |

### M5-T · Cost tag status (S9)

Owns: area files: `admin-costTagStatus`; `presentation/screens/s9-cost-tags/status/` (+ line in `sections.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M5-T1 | Per key: seen in CUR, first and last seen, AWS activation; a key not seen 3 days after activation is flagged | WEB-US-19.3, WEB-19 | — |
| [ ] | M5-T2 | e2e and visual refresh of S9 (`25`) | WEB-US-42.2 (part) | M5-T1 |

### M5-X · Exit

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M5-X1 | Merge; gate and e2e green; viewer no-mutation e2e over P4 and T1 kubeconfig; re-pin check; status, dashboard | WEB-US-36.1 (part) | all M5 |

---

## M6 — CVE remediation and completion

Goal: P3, P5, P6, the security operator console, S10 service keys and operators, the quality sweep and the
contract re-pin. O, W, T, K in parallel; then Q; U whenever CQ-1 lands (else last). Merge order: O, W, T,
K, Q, U.

### M6-O · Security operator console

Owns: `domain/navigation.ts` (security operator entries), `presentation/shell/` (security operator header and landing), `e2e/specs/security-operator/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-O1 | Security operator: header *Security operator*, navigation only *Work orders* and *Swarm templates* (read-only), landing on `/work-orders`; team-scoped routes not-found; per-team work orders through `ListWorkOrders?teamId=` | WEB-US-40.1 (part), WEB-US-8.5 (part), WEB-US-41.2 (part), WEB-3 | — |
| [ ] | M6-O2 | e2e as `sec-op`, including that no team-scoped request is sent | WEB-US-8.5 (part) | M6-O1 |

### M6-W · Work orders (P3, P6)

Owns: area files: `workOrders` (extends `application/ports/workOrders.ts`), `teamDirectory`; `presentation/screens/p3-work-orders/`, `presentation/screens/p6-work-order/`; search source line for work orders.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-W1 | Ports, adapters, use cases: list, create, get, update, cancel, repos list/update, `ListTeamDirectory`, `ListSwarmTemplates` | WEB-13 | — |
| [ ] | M6-W2 | P3 list filtered by status, severity, SLA state and team, showing team names from `ListTeamDirectory` | WEB-US-40.1 | M6-W1 |
| [ ] | M6-W3 | *Create work order*: CVE, severity, SLA, template (enabled only), cap, repositories each with an owner picker: team from `ListTeamDirectory` by slug or name, email, both, or none (resolved by `afs-api` from teams' `AFS_OWNED_REPOS`; explicit owner wins) | WEB-US-40.2, WEB-13, D38 | M6-W1 |
| [ ] | M6-W4 | Owner pre-fill: `400` with `details.ambiguousRepos` pre-fills each listed repo's picker with the candidates; `details.unownedRepos` highlights repos needing an owner; after create each repo shows *team configuration* or *explicit* (`ownerSource`); CLI preview `--repos host/owner/repo` and `--repos host/owner/repo=team_…,ops@example.com` | WEB-US-40.3, WEB-6, D38 | M6-W3, M1-L3 |
| [ ] | M6-W5 | A second work order for an open CVE shows the API's `409` with a link to the existing one | WEB-US-40.4 | M6-W3 |
| [ ] | M6-W6 | P6 detail: SLA state, remediation team with spend against cap, one row per repository with status, PR link and notifications sent; *Cancel* asks for a reason | WEB-US-40.5 | M6-W1 |
| [ ] | M6-W7 | Team-admin or viewer of an owning team: read-only with only their repositories' rows; a work order with no link to their teams → not-found (API `404`) | WEB-US-40.6 | M6-W6 |
| [ ] | M6-W8 | Header search source for work orders (security operators) | WEB-US-8.8 (part) | M6-W2 |
| [ ] | M6-W9 | e2e, axe, visual P3 (`15`) and P6 (`29`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M6-W2..W8 |

### M6-T · Swarm templates (P5)

Owns: area files: `swarmTemplates`; `presentation/screens/p5-swarm-templates/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-T1 | Service admins create and edit templates (stages, pools, handoffs, secrets needed, configuration, cap, TTL, teardown), see revisions, enable/disable; a disabled template is not offered in *Create work order* | WEB-US-41.1, WEB-13 | — |
| [ ] | M6-T2 | Security operators see the page read-only; team roles do not see it (not-found) | WEB-US-41.2, D37 | M6-T1 |
| [ ] | M6-T3 | e2e, axe, visual P5 (`28`) | WEB-US-42.1 (part), WEB-US-42.2 (part) | M6-T1, M6-T2 |

### M6-K · Service API keys and security operators (S10)

Owns: area files: `admin-apiKeys`, `admin-securityOperators`; `presentation/screens/s10-settings/tabs/{service-api-keys,security-operators}/` (+ lines in `tabs.ts`).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-K1 | *Service API keys*: create with the `security_operator` role only, expiry ≤ 90 days, secret shown once; list prefix, expiry, last use; delete | WEB-US-20.5, WEB-US-11.3 (part), WEB-16 | — |
| [ ] | M6-K2 | *Security operators*: add or remove users and IdP groups | WEB-US-20.6, WEB-16 | — |
| [ ] | M6-K3 | e2e incl. sentinel for `CreateServiceApiKey`; axe; visual (S2 pattern) | WEB-US-11.1 (part), WEB-US-42.1 (part), WEB-US-42.2 (part) | M6-K1, M6-K2 |

### M6-Q · Quality sweep (after O, W, T, K)

Owns: `e2e/specs/sweep/`, `e2e/visual/approvals.json` (all entries), `e2e/visual/baselines/`.

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-Q1 | axe on all 33 screens and their dialogs with no serious or critical issue; keyboard-only completion of each role's key flows (root §5.4); status changes announced through live regions | WEB-US-42.1, WEB-10, NFR-8 | all M6 streams |
| [ ] | M6-Q2 | Visual: one baseline per screen (33) at 1440 × 900 @2× with mockup fixture data; side-by-side report artifact; `approvals.json` complete (`pending` until the web lead approves, W-3); diffs above 0.5% fail CI | WEB-US-42.2, WEB-1 | M6-Q1 |
| [ ] | M6-Q3 | Viewer sessions over every team screen send no mutating `fetch` (recorder) | WEB-US-36.1 | — |
| [ ] | M6-Q4 | Sentinel e2e over every secret path (create and rotate secret, `CreateApiKey`, `CreateServiceApiKey`, identity provider client secret): absent from TanStack query and mutation caches, storages, IndexedDB, cookies, URL and history state, console output, telemetry payloads and the DOM after close | WEB-US-11.1 | — |
| [ ] | M6-Q5 | Performance and browsers: FCP < 1.5 s and route change < 300 ms with cached data on the fake API with 40 ms RTT and 50 Mbit/s throttling; initial route ≤ 300 KB gzip; Firefox and WebKit smoke | NFR-1, NFR-3 | — |
| [ ] | M6-Q6 | Security: serve the build with the `deploy/` headers in e2e and assert no CSP violation on any screen; OWASP ASVS L2 checklist (session, data protection, configuration) recorded in implementation-notes.md | NFR-6, FR-037 | — |
| [ ] | M6-Q7 | Coverage ≥ 90% on `domain` and `application`; audit that every `Permission` has a denied-case test (fails on a permission without one) | NFR-7 | — |

### M6-U · Contract re-pin

Owns: `packages/sdk/contract/`, `packages/sdk/src/generated/`, `domain/generated/`, `packages/sdk/package.json` (version).

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-U1 | Re-pin to the `-restapi` release tag (CQ-1) with `contract:update --ref <tag>`; regenerate; fix compile errors; drift tests green; remove the CQ-2 interim if `ApiKey.version` exists; confirm CQ-3; `@afs/sdk` `1.0.0` when the tag is v1 | SDK-1, plan.md §5 | CQ-1 |

### M6-X · Exit (feature complete)

| ✓ | ID | Task | AC / Req | Depends |
|---|---|---|---|---|
| [ ] | M6-X1 | Merge; gate, CI and full e2e green; every criterion in the traceability table proven by a passing test; a check fails if any `NotBuiltYet` route or `notImplementedPort` remains; status 100%; dashboard step 3 complete | all | all M6 |

---

## Traceability

Generated from the tables above at step 2 (review) by checking every `AC / Req` cell; regenerate when tasks change. Every one of the 182 criteria and every PRD requirement has at least one task.

### Story criteria → tasks

| Criterion | Tasks |
|---|---|
| WEB-US-1.1 | M0-G5 |
| WEB-US-1.2 | M0-G3, M0-C6 |
| WEB-US-1.3 | M0-C2, M0-C6 |
| WEB-US-1.4 | M0-C7 |
| WEB-US-1.5 | M0-C2 |
| WEB-US-1.6 | M0-S4, M0-C10 |
| WEB-US-2.1 | M0-C3 |
| WEB-US-2.2 | M0-C3 |
| WEB-US-2.3 | M0-C3 |
| WEB-US-2.4 | M0-C9 |
| WEB-US-3.1 | M0-C4 |
| WEB-US-3.2 | M0-C4 |
| WEB-US-3.3 | M0-C5 |
| WEB-US-3.4 | M0-C5 |
| WEB-US-3.5 | M0-C4 |
| WEB-US-3.6 | M0-C4 |
| WEB-US-4.1 | M1-K1 |
| WEB-US-4.2 | M0-C11, M3-K1 |
| WEB-US-4.3 | M0-S4, M0-P4 |
| WEB-US-4.4 | M0-P1, M0-P2 |
| WEB-US-4.5 | M0-P3 |
| WEB-US-5.1 | M0-G2, M0-P5 |
| WEB-US-5.2 | M0-G2, M0-C1, M0-P5 |
| WEB-US-5.3 | M0-C1 |
| WEB-US-5.4 | M0-C1, M0-C2 |
| WEB-US-5.5 | M0-C8, M0-H9 |
| WEB-US-6.1 | M0-G3, M0-C9 |
| WEB-US-6.2 | M0-C9, M1-M5 |
| WEB-US-7.1 | M0-A2, M0-E4 |
| WEB-US-7.2 | M0-A3 |
| WEB-US-7.3 | M0-A3 |
| WEB-US-7.4 | M0-A4 |
| WEB-US-7.5 | M0-A5, M0-E4 |
| WEB-US-7.6 | M0-A6, M0-E4 |
| WEB-US-7.7 | M0-A7 |
| WEB-US-7.8 | M0-A8, M0-E4 |
| WEB-US-7.9 | M0-A9 |
| WEB-US-8.1 | M0-D1 |
| WEB-US-8.2 | M4-W3, M4-I6 |
| WEB-US-8.3 | M0-D2 |
| WEB-US-8.4 | M0-H3 |
| WEB-US-8.5 | M0-D4, M0-H4, M0-H5, M0-E5, M6-O1, M6-O2 |
| WEB-US-8.6 | M0-H6 |
| WEB-US-8.7 | M0-D4, M0-H1, M0-H5 |
| WEB-US-8.8 | M0-D6, M0-H7, M0-E5, M6-W8 |
| WEB-US-8.9 | M0-H8 |
| WEB-US-9.1 | M0-D3, M0-U4, M1-Q6, M1-O1 |
| WEB-US-9.2 | M0-D3, M1-Q2, M1-T7 |
| WEB-US-9.3 | M1-Q2 |
| WEB-US-9.4 | M1-Q3 |
| WEB-US-9.5 | M1-Q4 |
| WEB-US-9.6 | M0-D3, M2-A3 |
| WEB-US-10.1 | M1-Q5 |
| WEB-US-10.2 | M1-Q1 |
| WEB-US-10.3 | M0-U4 |
| WEB-US-11.1 | M1-Q6, M1-Y1, M1-M6, M2-S7, M2-X1, M6-K3, M6-Q4 |
| WEB-US-11.2 | M0-U8, M1-N3, M2-S2 |
| WEB-US-11.3 | M0-U5, M1-M2, M6-K1 |
| WEB-US-11.4 | M1-L2, M2-S6 |
| WEB-US-12.1 | M1-D1 |
| WEB-US-12.2 | M1-D2 |
| WEB-US-12.3 | M1-D3 |
| WEB-US-13.1 | M1-T1, M1-T2 |
| WEB-US-13.2 | M1-T3 |
| WEB-US-13.3 | M1-T3 |
| WEB-US-13.4 | M1-T4 |
| WEB-US-13.5 | M1-T4 |
| WEB-US-14.1 | M0-U6, M1-L3, M1-T5 |
| WEB-US-14.2 | M1-T6 |
| WEB-US-14.3 | M1-T6 |
| WEB-US-14.4 | M1-T7 |
| WEB-US-15.1 | M3-P1 |
| WEB-US-16.1 | M4-A1 |
| WEB-US-16.2 | M4-A2 |
| WEB-US-16.3 | M4-A3 |
| WEB-US-17.1 | M4-W1 |
| WEB-US-17.2 | M4-W2 |
| WEB-US-17.3 | M4-W3 |
| WEB-US-18.1 | M2-F1 |
| WEB-US-18.2 | M2-F2 |
| WEB-US-18.3 | M2-F3 |
| WEB-US-18.4 | M2-F4 |
| WEB-US-19.1 | M4-G1 |
| WEB-US-19.2 | M4-G2 |
| WEB-US-19.3 | M5-T1 |
| WEB-US-19.4 | M4-G3 |
| WEB-US-20.1 | M1-N2 |
| WEB-US-20.2 | M1-N3 |
| WEB-US-20.3 | M2-G1 |
| WEB-US-20.4 | M2-G2 |
| WEB-US-20.5 | M6-K1 |
| WEB-US-20.6 | M6-K2 |
| WEB-US-20.7 | M4-N1 |
| WEB-US-20.8 | M0-D4, M1-N1 |
| WEB-US-21.1 | M4-E1 |
| WEB-US-21.2 | M4-E2 |
| WEB-US-22.1 | M2-G2 |
| WEB-US-22.2 | M2-C1, M5-P3 |
| WEB-US-22.3 | M2-A7, M5-P7 |
| WEB-US-23.1 | M5-G1 |
| WEB-US-23.2 | M5-G2 |
| WEB-US-23.3 | M5-G3 |
| WEB-US-24.1 | M1-O1 |
| WEB-US-24.2 | M1-O2 |
| WEB-US-24.3 | M1-O3 |
| WEB-US-24.4 | M1-O4 |
| WEB-US-24.5 | M1-O5 |
| WEB-US-24.6 | M1-O4 |
| WEB-US-25.1 | M2-A1, M2-A2 |
| WEB-US-25.2 | M2-A3 |
| WEB-US-25.3 | M2-A4 |
| WEB-US-25.4 | M2-A5, M4-I5 |
| WEB-US-25.5 | M2-A6 |
| WEB-US-26.1 | M2-C1 |
| WEB-US-26.2 | M2-C2 |
| WEB-US-26.3 | M2-C3 |
| WEB-US-26.4 | M2-C4 |
| WEB-US-26.5 | M2-C5 |
| WEB-US-26.6 | M2-C3 |
| WEB-US-26.7 | M1-L3, M2-C6 |
| WEB-US-27.1 | M2-S2 |
| WEB-US-27.2 | M2-S3 |
| WEB-US-27.3 | M2-S4 |
| WEB-US-27.4 | M2-S5 |
| WEB-US-28.1 | M3-B1 |
| WEB-US-28.2 | M3-B2 |
| WEB-US-28.3 | M3-B3 |
| WEB-US-28.4 | M3-B4 |
| WEB-US-29.1 | M1-M1 |
| WEB-US-29.2 | M1-M2 |
| WEB-US-29.3 | M1-M3 |
| WEB-US-29.4 | M1-M4 |
| WEB-US-29.5 | M1-M5 |
| WEB-US-30.1 | M2-V1 |
| WEB-US-30.2 | M2-V2 |
| WEB-US-30.3 | M2-V3 |
| WEB-US-30.4 | M2-V4 |
| WEB-US-31.1 | M4-I1 |
| WEB-US-31.2 | M4-I2 |
| WEB-US-31.3 | M4-I3 |
| WEB-US-31.4 | M4-I4 |
| WEB-US-32.1 | M2-E1 |
| WEB-US-32.2 | M2-E2 |
| WEB-US-32.3 | M2-E3 |
| WEB-US-33.1 | M4-G4 |
| WEB-US-33.2 | M4-G5 |
| WEB-US-34.1 | M4-L1 |
| WEB-US-34.2 | M3-N1, M3-N2 |
| WEB-US-34.3 | M3-N3 |
| WEB-US-34.4 | M3-N4 |
| WEB-US-34.5 | M3-N5, M4-L2 |
| WEB-US-35.1 | M1-H1 |
| WEB-US-35.2 | M1-H2 |
| WEB-US-35.3 | M4-S3 |
| WEB-US-36.1 | M0-U2, M1-O6, M1-X1, M2-X1, M3-X1, M4-X1, M5-X1, M6-Q3 |
| WEB-US-36.2 | M2-S3 |
| WEB-US-37.1 | M3-C2, M3-R1, M3-R6 |
| WEB-US-37.2 | M3-R2, M3-R6 |
| WEB-US-37.3 | M3-R3 |
| WEB-US-37.4 | M3-R4 |
| WEB-US-37.5 | M3-R5 |
| WEB-US-37.6 | M4-S1 |
| WEB-US-37.7 | M4-S2 |
| WEB-US-38.1 | M5-E1 |
| WEB-US-38.2 | M5-E2 |
| WEB-US-38.3 | M5-E3 |
| WEB-US-39.1 | M5-P2 |
| WEB-US-39.2 | M5-P3 |
| WEB-US-39.3 | M5-P4 |
| WEB-US-39.4 | M5-P5 |
| WEB-US-39.5 | M5-P6 |
| WEB-US-39.6 | M5-P7 |
| WEB-US-40.1 | M6-O1, M6-W2 |
| WEB-US-40.2 | M6-W3 |
| WEB-US-40.3 | M6-W4 |
| WEB-US-40.4 | M6-W5 |
| WEB-US-40.5 | M6-W6 |
| WEB-US-40.6 | M6-W7 |
| WEB-US-41.1 | M6-T1 |
| WEB-US-41.2 | M6-O1, M6-T2 |
| WEB-US-42.1 | M0-U4, M0-U9, M0-E5, M1-T9, M1-O7, M1-M6, M1-D4, M1-N4, M1-H3, M2-A8, M2-C7, M2-S7, M2-V5, M2-E4, M2-F5, M2-G4, M3-C1, M3-B5, M3-P2, M3-R7, M3-N6, M4-A4, M4-W4, M4-G6, M4-I7, M4-L3, M4-E3, M4-S4, M4-N2, M5-E4, M5-P8, M5-G4, M6-W9, M6-T3, M6-K3, M6-Q1 |
| WEB-US-42.2 | M0-U1, M0-E3, M1-T9, M1-O7, M1-M6, M1-D4, M1-N4, M1-H3, M2-A8, M2-C7, M2-S7, M2-V5, M2-E4, M2-F5, M2-G4, M3-B5, M3-P2, M3-R7, M3-N6, M4-A4, M4-W4, M4-G6, M4-I7, M4-L3, M4-E3, M4-N2, M5-E4, M5-P8, M5-T2, M6-W9, M6-T3, M6-K3, M6-Q2 |

### Requirements → tasks

| Requirement | Tasks |
|---|---|
| SDK-1 | M0-S2, M0-G1, M0-G4, M0-G5, M6-U1 |
| SDK-2 | M0-C3 |
| SDK-3 | M0-G4, M0-C7 |
| SDK-4 | M0-G3, M0-C5, M0-C6 |
| SDK-5 | M0-C2 |
| SDK-6 | M0-C4 |
| SDK-7 | M1-K1 |
| SDK-8 | M0-C11, M3-K1 |
| SDK-9 | M0-S1, M0-C10, M0-P1, M0-P3, M0-P4 |
| SDK-10 | M0-G2, M0-C1, M0-C8, M0-D5 |
| SDK-11 | M0-G3, M0-C9 |
| WEB-1 | M1-T2, M1-T8, M4-I6, M6-Q2 |
| WEB-2 | M0-A2, M0-A4, M0-A5, M0-E2 |
| WEB-3 | M0-U2, M0-H2, M0-H4, M0-H8, M0-H10, M6-O1 |
| WEB-4 | M0-D1, M0-D2 |
| WEB-5 | M0-U1, M0-U3, M0-U6, M0-U7, M0-H5, M0-H7 |
| WEB-6 | M0-U8, M1-L1, M1-L2, M1-L3, M1-T5, M2-C6, M2-S6, M5-P6, M6-W4 |
| WEB-7 | M0-D3, M1-Q2 |
| WEB-8 | M0-U5, M0-U8, M1-Q6, M2-S1 |
| WEB-9 | M3-C1, M3-C2, M3-R1, M3-R3 |
| WEB-10 | M0-U9, M6-Q1 |
| WEB-11 | M0-U4, M0-H2, M1-Q5 |
| WEB-12 | M5-P1, M5-P2 |
| WEB-13 | M6-W1, M6-W3, M6-T1 |
| WEB-14 | M5-G1 |
| WEB-15 | M5-G1, M5-G3 |
| WEB-16 | M1-N1, M2-G1, M4-N1, M6-K1, M6-K2 |
| WEB-17 | M4-E1, M4-E2 |
| WEB-18 | M0-S3, M0-D4, M0-H1, M2-G3 |
| WEB-19 | M4-G3, M5-T1 |
| WEB-20 | M2-C1, M2-G2, M2-G3, M5-P3 |
| WEB-21 | M3-N1, M4-L1 |
| WEB-22 | M1-H1, M1-H2, M4-S3 |
| NFR-1 | M0-W3, M6-Q5 |
| NFR-2 | M0-P2 |
| NFR-3 | M0-W1, M6-Q5 |
| NFR-4 | M1-Q1, M1-Q4, M1-Q7 |
| NFR-5 | M1-Y1 |
| NFR-6 | M0-S3, M6-Q6 |
| NFR-7 | M0-S1, M0-S4, M6-Q7 |
| NFR-8 | M0-U9, M6-Q1 |
| FR-034 | M0-S5, M0-W1 |
| FR-035 | M0-A1 |
| FR-036 | M0-W2 |
| FR-037 | M0-W1, M0-W2, M6-Q6 |
| FR-038 | M0-W2, M0-E1 |
