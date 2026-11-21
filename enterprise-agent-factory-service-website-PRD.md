# Enterprise Agent Factory Service — SDK and console PRD (`-website`)

| | |
|---|---|
| **Status** | Draft for review (2026-11-21) |
| **Author** | J (Enterprise Architecture), drafted with Claude |
| **Parent** | [Root PRD](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/enterprise-agent-factory-service-initial-PRD.md) (§5 UX and screens by role; stories US-1..US-16; IF-3, IF-4) |
| **Consumes** | [API contract](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/docs/contracts/api-contract.md) via `-restapi/api/openapi.yaml` at a release tag |
| **Provides** | `@afs/sdk` (public TypeScript surface, semver) and the web console |
| **Runtime** | Bun 1.4 (Node.js 22 fallback); TypeScript 7; React 19; Vite 8; Vitest 5; Biome 2 |

## 1. Purpose

Two packages in one Bun workspace:

- **`@afs/sdk`** (`packages/sdk`): a typed, ergonomic client for every API operation, for the console,
  pipelines and other TypeScript code. Zero runtime dependencies; injectable `fetch`.
- **`@afs/console`** (`apps/console`): the web console from the root PRD §5, familiar to AWS console
  users, role-aware, accessible, built with clean architecture on the SDK.

## 2. Requirements owned

### 2.1 SDK

| Id | Requirement | Product reqs | Pri |
|---|---|---|---|
| SDK-1 | Types generated from `openapi.yaml` into `src/generated/` (never hand-edited); a resource client per tag with the method names in the API contract `SDK` column | IF-3, G6 | P0 |
| SDK-2 | Auth providers: bearer token supplier (refresh-aware) and API key; `Authorization` never logged | ACC-1, ACC-4 | P0 |
| SDK-3 | Pagination as async iterators (`for await (const team of afs.teams.list())`) plus page access | IF-3 | P0 |
| SDK-4 | `If-Match` from the resource's `version` on updates and deletes; `Idempotency-Key` generated on creates (overridable) | CFG-1 | P0 |
| SDK-5 | `AfsError` with `code`, `status`, `requestId`, `details` and `isAccessDenied`, `isNotFound`, `isConflict`, `isPreconditionFailed`, `isThrottled` | IF-3 | P0 |
| SDK-6 | Retries with jitter for `429` (honouring `Retry-After`), `503` and network errors on idempotent requests and on creates with an idempotency key | IF-3 | P0 |
| SDK-7 | `waitFor(resource, phase)` helper polling status | TEAM-5 | P1 |
| SDK-8 | Reports return typed rows; `asCsv()` returns the API's CSV | RPT-1..9 | P0 |
| SDK-9 | Works in browsers, Bun and Node 22; ESM; tree-shakeable; TSDoc on every export from `src/index.ts` | IF-3 | P0 |

### 2.2 Console

| Id | Requirement | Product reqs | Pri |
|---|---|---|---|
| WEB-1 | Every screen in the root PRD §5.3 (S1–S9, T1–T13, V1–V2, later P2–P3), matching the mockups in the root `docs/ui/` | IF-4 | P0/P1 |
| WEB-2 | Sign-in with OIDC authorization code + PKCE against the team's or default provider from `ListSignInProviders`; tokens in memory only; silent renew | ACC-1 | P0 |
| WEB-3 | Role-aware UX from `GetMe`: header shows role and team; team switcher lists bound teams; disallowed actions disabled with "Requires <role>" tooltip; admin-only areas hidden from team roles; any `AccessDenied` from the API shown as an access-denied alert | ACC-3 | P0 |
| WEB-4 | `domain/permission.ts` mirrors the API contract permission catalog exactly; a test compares it with a fixture exported from `-restapi` | ACC-3 | P0 |
| WEB-5 | AWS-console patterns: global header with search and environment; left navigation; breadcrumbs; page header with *Info*; tables with filter, property filters, pagination and preferences; one primary action; *Actions* menu; wizards with review step; status as dot plus word | §5.1 | P0 |
| WEB-6 | Every create form shows the equivalent `afs` command, built from the form's values (never including a secret value) | §5.1 | P0 |
| WEB-7 | Desired vs actual: resources show phase and observed generation; mutations show `Pending` until `Ready` | TEAM-5 | P0 |
| WEB-8 | Secret values exist only in the input field during submit; never in state managers, URLs, storage, logs or analytics | SEC-1 | P0 |
| WEB-9 | Reports: charts and tables with range, filters, grouping incl. tag, CSV download; *Unmetered* notices | RPT-1..9, TAG-6 | P0 |
| WEB-10 | Accessibility WCAG 2.2 AA: keyboard reachable, labelled inputs, announced status and alerts, contrast; automated axe checks per screen | NFR | P0 |
| WEB-11 | Concurrency: a `412` on save shows "This changed since you opened it" with *Reload* and keeps the user's edits visible | CFG-1 | P0 |

## 3. User stories and acceptance criteria

### SDK

**WEB-US-1 · Typed automation.** *(G6)* As a pipeline author, I want a typed client for every operation.
- A test fails if any `operationId` in the pinned `openapi.yaml` has no SDK method (except health).
- `await afs.teams.update(team, {displayName})` sends `If-Match: "<team.version>"`; a `412` throws
  `AfsError` with `isPreconditionFailed() === true`.
- Iterating `afs.agents.list(teamId)` follows `nextToken` until absent, making one request per page.
- No test calls a real API; tests inject a fake `fetch`.

**WEB-US-2 · Safe secrets in the SDK.** *(US-6)*
- `secrets.create({…, value})` sends the value once; the SDK never logs request bodies, and its error
  objects never include request bodies.

### Console, service admin

**WEB-US-3 · Onboard a team (S3).** *(US-1)*
- The wizard has five steps (details, models and network, budget, members, review); *Next* is disabled
  until the step is valid; the review step shows everything and the equivalent CLI command.
- Required service tags appear in step 1 with their allowed values as a select; the team cannot be
  created without them; a server `ValidationError` highlights the named fields.
- The sign-in provider select appears only when more than one provider exists, with the default chosen.
- After *Create*, the team appears in S2 as `Reconciling` and updates to `Ready` without a page reload.

**WEB-US-4 · Prices and variance (S1, S4).** *(US-10)*
- S1 shows a warning banner when any team-day is over the variance threshold or price proposals are
  pending, with links to each.
- S4 lists pending proposals with old and new prices; *Approve* and *Reject* ask for confirmation and an
  optional note; after success the row moves to the price history with the approver.

**WEB-US-5 · Cost allocation tags (S9).** *(US-12)*
- System tags are listed read-only; service tags can be added, edited and removed (fixed or required,
  allowed values, default); teams missing a required value are listed with links.
- Spend can be grouped by any tag key, with *(untagged)* shown separately.

### Console, team-admin

**WEB-US-6 · Create an agent (T3).** *(US-4, US-5)*
- The form takes template, digest-pinned image, model (only the team's), storage (size, class, on-delete,
  snapshots), IAM identity, secret bindings (env name or file path) and configuration values; there is no
  replica field.
- A short help panel says secrets and configuration arrive as environment variables and files, with no
  change to the agent's code.
- Binding a secret to an env var already used by a configuration value is blocked client-side and by the
  API.

**WEB-US-7 · Secrets (T4).** *(US-6)*
- The create dialog takes scope, name, description, optional external system and value (masked); the
  managed path is previewed; after submit the value field is cleared and never shown again.
- Rotate asks for the new value and warns which agents will restart.

**WEB-US-8 · Team tags (T13).** *(US-12)*
- Shows system, service and team tags with their source; team-admins edit required values and their own
  tags; fixed tags and system tags are read-only; viewers see everything read-only.

**WEB-US-9 · External systems (T9, T10).** *(US-8)*
- Switches show the inherited state; a system off at a higher level is shown off and disabled with the
  level named; unmetered LLM systems carry the *Unmetered* badge.

### Console, viewer

**WEB-US-10 · Read-only that explains itself (V1, V2).** *(US-2)*
- Every control that changes state is visible but disabled with "Requires team-admin"; no request that
  would change state can be sent from a viewer session (tested by asserting no mutating `fetch`).
- Secrets show names, paths, usage and rotation; there is no value column with content.

### All roles

**WEB-US-11 · Reports (S8, T11, T12).** *(US-11)*
- Range picker (24 h, 7, 30, 90 days, month to date, custom); filters; group by incl. tag; *Download
  CSV* downloads exactly what the API returns for the same query.
- Activity views show working, idle and other states, utilization, and *idle since* for idle agents.

**WEB-US-12 · Accessible.** *(NFR)*
- Every screen passes automated axe checks with no serious or critical issues; all flows complete by
  keyboard only; status changes are announced through live regions.

## 4. Architecture rules (console)

`presentation` → `application` → `domain`; `infrastructure` → `application` → `domain`; only `main/`
imports `infrastructure`; `presentation` never imports `@afs/sdk`. `src/architecture.test.ts` enforces
it. Use cases are the console's API; server-state caching wraps use cases in `presentation`.

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | First contentful paint < 1.5 s on a corporate laptop; route changes < 300 ms with cached data; bundle budget 300 KB gzip for the initial route |
| Browsers | Current Chrome, Edge, Firefox, Safari |
| Security | CSP without `unsafe-inline` scripts; tokens in memory only; no secret value in state, URL, storage or logs; OWASP ASVS L2 |
| Quality | `domain` and `application` ≥ 90% coverage; denied-case test for every permission rule; `bun run gate` before every commit |
| Accessibility | WCAG 2.2 AA |

## 6. Delivery

| Milestone | This repository |
|---|---|
| M0 | SDK generation pipeline, auth, errors, pagination; console shell, sign-in, `GetMe`, permission mirror |
| M1 | S1–S3, T1, T6, V1 |
| M2 | T2–T4, T7, T9, T10, S7, V2 |
| M3 | T5, S4, S8, T11, T12 |
| M4 | S5, S6, S9, T8, T13; scheduled reports; export and import pages |
| Phase 2/3 | P2, P3 |

## 7. Definition of done (every change)

- [ ] SDK regenerated from the pinned contract when it changed; public surface documented
- [ ] Dependency rule holds (`architecture.test.ts` green)
- [ ] Controls gated by `can(...)` and `AccessDenied` from the API handled
- [ ] No secret value in state, URL, storage or logs; no token in `localStorage`
- [ ] Accessible; matches the mockup; equivalent CLI shown on create forms
- [ ] `bun run gate` green; stories' acceptance criteria covered
