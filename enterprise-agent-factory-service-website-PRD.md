# Enterprise Agent Factory Service — SDK and console PRD (`-website`)

| | |
|---|---|
| **Status** | Draft for review, feature-complete scope; revised after `review-prd` (2026-11-21) |
| **Author** | J (Enterprise Architecture), drafted with Claude |
| **Parent** | [Root PRD](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/enterprise-agent-factory-service-initial-PRD.md) (§4 roles; §5 UX, IA and screens; §6.13 stories US-1..US-18; §9 release plan; §10.1 decisions D23–D46) |
| **Consumes** | [API contract](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/docs/contracts/api-contract.md) via `-restapi/api/openapi.yaml`, pinned at a release tag (§9) |
| **Provides** | `@afs/sdk` (public TypeScript surface, semver) and the web console |
| **Runtime** | Bun 1.4 (Node.js 22 fallback); TypeScript 7; React 19; Vite 8; Vitest 5; Biome 2; Playwright for e2e and visual checks |

## 1. Purpose and users

AFS gives delivery teams governed AI agents without a platform ticket for every change. The REST API
decides everything; this repository is how people and TypeScript code reach it. It ships two packages
in one Bun workspace:

- **`@afs/sdk`** (`packages/sdk`): a typed, ergonomic client for every API operation, for the console,
  pipelines and other TypeScript code. Zero runtime dependencies; injectable `fetch`.
- **`@afs/console`** (`apps/console`): the web console from the root PRD §5, familiar to AWS console
  users, role-aware, accessible, built with clean architecture on the SDK.

| User | Uses | Jobs in this repository's scope |
|---|---|---|
| Service admin | Console (global navigation and any team) | Onboard and govern teams, models and prices, settings, export/import, swarm and agent templates |
| Team-admin | Console (team context) | Agents, pools, secrets, config, members and keys, budget, delivery, reports |
| Team viewer | Console, read-only | Status, usage, costs and history; understands what they cannot change and why |
| Security operator | Console (*Work orders* only), service API key | Create and track CVE work orders across teams |
| Pipeline or tool author | `@afs/sdk` | Automate any operation with typed calls, safe retries and pagination |

## 2. Scope and non-goals

Scope is feature complete (root ADR-014): every screen and operation is built; priorities are build order.

Non-goals for this release:

- **No secret reveal** in any role or screen. Values are write-only; there is no *Show value*.
- **No direct Kubernetes or AWS calls** from the browser or the SDK; everything goes through `afs-api`.
- **No i18n or localisation:** en-US text, USD money, dates shown in the browser's time zone with UTC on hover.
- **No offline mode** and no service worker caching of API data.
- **No mobile layout** below 1024 px viewport width; the console shows a "Use a wider window" notice below it.
- **No full-text search** and no search API (D44); the header search filters lists the caller can already read.
- **No push updates** (SSE or WebSocket) in v1; status is polled (WEB-7).
- **No client-side workflows** that hide several mutations behind one button beyond what one API call does.

## 3. Requirements owned

The **AC** column names the stories in §5 whose criteria prove each requirement.

### 3.1 SDK

| Id | Requirement | Product reqs | Pri | AC |
|---|---|---|---|---|
| SDK-1 | Types generated from the pinned `openapi.yaml` into `src/generated/` (never hand-edited). A resource client per tag. Method names follow the explicit `operationId` → SDK method table in the API contract §4 (for example `GetHealth` → `health.get()`). A coverage test fails on any `operationId` with no method or any method not in the table | IF-3, G6 | P0 | WEB-US-1 |
| SDK-2 | Auth providers: a bearer token supplier `(opts: {forceRefresh}) => Promise<string>` (refresh-aware) and a static API key. On `401` the supplier is called once with `forceRefresh: true` and the request retried once. `Authorization` is never logged or put in an error | ACC-1, ACC-4 | P0 | WEB-US-2 |
| SDK-3 | Pagination as async iterators (`for await (const team of afs.teams.list())`) plus page access (`.pages()`, `maxResults`, `nextToken`) | IF-3 | P0 | WEB-US-1 |
| SDK-4 | Safe writes (D40): updates and deletes take the resource (or `{id, version}`) and send `If-Match: "<version>"`; given an id only, the SDK reads first and reports the version it applied to. Creates and `:verb` actions get a generated `Idempotency-Key` (overridable) that is reused on every retry. `Idempotent-Replayed` is exposed on the response metadata | CFG-1, IF-1 | P0 | WEB-US-1, WEB-US-3 |
| SDK-5 | `AfsError` with `code`, `status`, `requestId`, `details`, and **getters** for every contract code: `isValidationError`, `isUnauthenticated`, `isAccessDenied`, `isNotFound`, `isConflict`, `isPreconditionFailed`, `isPreconditionRequired`, `isThrottled`, `isUnavailable`, `isInternalError`. `code` is an open union (known codes or any string) | IF-3 | P0 | WEB-US-1, WEB-US-3 |
| SDK-6 | Retries with full jitter (base 200 ms, cap 5 s, at most 3 retries, configurable) for `429` (honouring `Retry-After`), `503`, `409` with `details.reason = idempotency_in_progress` (honouring `Retry-After: 1`) and network errors. `429` and `503` are retried for every method; network errors and `idempotency_in_progress` only for `GET`, `PUT`, `DELETE` and `POST` with an `Idempotency-Key`. No other status is retried. An `AbortSignal` cancels a pending wait | IF-3 | P0 | WEB-US-3 |
| SDK-7 | `waitFor(resource, {until, timeoutMs, signal})` polls the resource's status with the WEB-7 cadence; resolves when a target phase is reached and `observedGeneration ≥ generation`; rejects on `Failed` (and `Degraded` unless targeted), on timeout and on abort | TEAM-5 | P1 | WEB-US-4 |
| SDK-8 | Reports return typed rows, totals and notes; `asCsv()` sends `Accept: text/csv` and returns the API's body unchanged | RPT-1..9 | P0 | WEB-US-4 |
| SDK-9 | Works in browsers (§7 versions), Bun 1.4 and Node 22; ESM only; `sideEffects: false`, tree-shakeable; core ≤ 25 KB gzip; TSDoc on every export, all exported from `src/index.ts` | IF-3 | P0 | WEB-US-4 |
| SDK-10 | Wire fidelity: money stays a decimal string (`Money` type, never `number`); enums are open (unknown values pass through); unknown fields are ignored without error; `X-Request-Id` can be sent and is exposed on every response and error; non-JSON responses (CSV, kubeconfig YAML, `204`) are handled; a non-JSON error body still yields an `AfsError`; `X-Afs-Contract-Version` is exposed and compared with the SDK's pinned version (D47) | IF-1, IF-3, BUD-1 | P0 | WEB-US-5 |
| SDK-11 | Secret values (`secrets.create`, `secrets.putValue`, `secrets.rotate`) and `apiKeys.create().secretKey` are never logged, cached by the SDK, or included in errors, debug hooks or retries' diagnostics | SEC-1 | P0 | WEB-US-6 |

### 3.2 Console

| Id | Requirement | Product reqs | Pri | AC |
|---|---|---|---|---|
| WEB-1 | Every screen in root §5.3 (S1–S11, T1–T15, V1–V2, P2–P6), each matching its approved mockup in the root `docs/ui/` (or, for S10, S11, T14 and T15, which have none, the S2 table pattern), checked by Playwright visual snapshots (§8) | IF-4 | P0–P2 | WEB-US-12..42 |
| WEB-2 | Sign-in (D42): provider picker from `ListSignInProviders` when more than one exists (default preselected); `?provider=` and `?teamId=` deep links; OIDC authorization code + PKCE (S256); tokens in memory only; silent renew; `401` handling; sign-out | ACC-1 | P0 | WEB-US-7 |
| WEB-3 | Role-aware UX from `GetMe`: header shows role and team (orange service admin, blue team-admin, grey viewer) or *Security operator*, who sees only *Work orders* and *Swarm templates* (read-only); team switcher lists bound teams; disallowed actions disabled with a "Requires <role>" tooltip; admin-only areas hidden from team roles; any `AccessDenied` from the API shown as an access-denied alert | ACC-3 | P0 | WEB-US-8 |
| WEB-4 | Permission source (D42): `can(me, permission, teamId)` reads the per-team `permissions[]` from `GetMe` (plus `serviceAdmin` and `securityOperator`), so flag-dependent rights (`teams:set-aws-accounts`, `teams:get-kubeconfig`, `work-orders:report`) follow the API. `domain/permission.ts` holds the catalog (roles incl. `security_operator`) only for tooltip text and a drift test against the fixture exported by `-restapi` | ACC-3 | P0 | WEB-US-8 |
| WEB-5 | AWS-console patterns: global header with search (D44), environment name and identity; left navigation; breadcrumbs; page header with *Info*; tables with text filter, property filters, pagination and preferences; one primary action; *Actions* menu; wizards with review step | §5.1 | P0 | WEB-US-8, WEB-US-42 |
| WEB-6 | Every create form shows the equivalent `afs` command (contract CLI column, `-cli` flag rules), built from the form's values and never including a secret value | §5.1 | P0 | WEB-US-14, WEB-US-26, WEB-US-11 |
| WEB-7 | Desired vs actual (D24): status as dot plus word with the contract's vocabulary; `observedGeneration` shown; polling 5 s while any shown resource is `Pending` or `Reconciling`, for up to 2 min, then 30 s; stops on `Ready` or `Failed` and while the page is hidden; honours `429 Retry-After` | TEAM-5 | P0 | WEB-US-9 |
| WEB-8 | Secret values (and a new API key's `secretKey`) exist only in the input or the one-time dialog; never in state managers, query cache, URLs, storage, logs, telemetry or analytics | SEC-1 | P0 | WEB-US-11 |
| WEB-9 | Reports: charts and tables with range, filters, grouping incl. tag, CSV download, scheduling (D23); *Unmetered* notices | RPT-1..9, TAG-6 | P0 | WEB-US-37 |
| WEB-10 | Accessibility WCAG 2.2 AA: keyboard reachable, labelled inputs, announced status and alerts, contrast; automated axe checks per screen | NFR | P0 | WEB-US-42 |
| WEB-11 | Concurrency and errors: a `412` on save shows "This changed since you opened it" with *Reload* and keeps the user's edits visible; every error alert shows the request id | CFG-1 | P0 | WEB-US-10 |
| WEB-12 | Swarms: *Pools & stages* (P4) only for ephemeral teams; create, scale, pause, resume and delete pools; create pool reuses the create-agent sections plus workers, stage, handoffs, storage and shared named role | AGT-8 | P2 | WEB-US-39 |
| WEB-13 | Work orders (P3, P6) for security operators and service admins, read-only for assigned and owning teams; owners chosen through `ListTeamDirectory` (D38); swarm templates (P5) for service admins | WO-1..6 | P2 | WEB-US-40, WEB-US-41 |
| WEB-14 | Isolation tier on team detail, editable by service admins only | TEAM-6 | P1 | WEB-US-23 |
| WEB-15 | Viewer kubectl switch on team detail (service admins only); with it on, team members see *Download kubeconfig* and the CLI command | ACC-5 | P2 | WEB-US-23 |
| WEB-16 | Service settings (S10): settings keys, identity providers, storage classes, agent templates (WEB-20), service API keys and security operators | ACC-1, ACC-2, ACC-4, AGT-9 | P0–P2 | WEB-US-20 |
| WEB-17 | Export and import (S11): create and download an export bundle; import with dry-run plan and account map | CFG-4..6 | P1 | WEB-US-21 |
| WEB-18 | Every IA navigation item maps to a screen id and route (§4.1); a test fails if a navigation item has no route or a route has no screen | §5.2 | P0 | WEB-US-8 |
| WEB-19 | S9 shows cost allocation tag status per key and the one-time activation banner until acknowledged | TAG-7 | P2 | WEB-US-19 |
| WEB-20 | S10 *Agent templates* tab (AGT-11) for service admins; T3 and *Create pool* offer only enabled templates and their allowed image digests | AGT-2, AGT-11 | P0 | WEB-US-22 |
| WEB-21 | Log delivery and notification channels (T14) | OPS-1, OPS-3, BUD-2 | P1 | WEB-US-34 |
| WEB-22 | Team history (T15): activity and audit, config revisions with diff and restore (dry-run first) | CFG-3, CFG-6 | P0 | WEB-US-35 |

## 4. Information architecture and routes

### 4.1 IA to screen mapping (WEB-18)

| IA item (root §5.2) | Screen | Route |
|---|---|---|
| Service › Dashboard | S1 | `/` |
| Service › Teams | S2 list; S3 create (P2 budget step for ephemeral); team detail with S6 and guardrails (WEB-14, WEB-15) | `/teams`, `/teams/new`, `/teams/:teamId/admin` |
| Service › Work orders | P3 list, P6 detail | `/work-orders`, `/work-orders/:id` |
| Governance › Budgets & ceilings | S2 with the budget columns, *Set ceiling* and *Raise ceiling temporarily* (BUD-1, D34); team budget in T5 | `/teams?view=budgets` |
| Governance › Cost reconciliation | S8 *Reconciliation* tab (`ListCostReconciliations`), linked from the S1 variance banner | `/reports/reconciliation` |
| Governance › Cost allocation tags | S9 | `/cost-tags` |
| Governance › Audit log | S5 | `/audit` |
| Platform › Model catalog & pricing | S4 | `/models` |
| Platform › Agent templates | S10 *Agent templates* tab (opens directly) | `/settings/agent-templates` |
| Platform › Swarm templates | P5 | `/swarm-templates` |
| Platform › External systems | S7 | `/external-systems` |
| Platform › Service settings | S10 | `/settings/:section` |
| Platform › Export & import | S11 | `/export-import` |
| Team › Overview | T1 (V1 for viewers) | `/t/:teamId` |
| Team › Agents | T2 list and detail panel (tabs: secrets & identity T8, external systems T10, usage T12, logs, revisions); T3 create | `/t/:teamId/agents[/:agentId]`, `/t/:teamId/agents/new` |
| Team › Pools & stages | P4 (ephemeral teams only) | `/t/:teamId/pools` |
| Team › Members & access | T6 *Members* tab | `/t/:teamId/members` |
| Team › API keys | T6 *API keys* tab (team-admins and service admins only, D49) | `/t/:teamId/members/api-keys` |
| Configuration › Secrets | T4 (V2 for viewers) | `/t/:teamId/secrets` |
| Configuration › Agent identities | T8, team view (every agent's identity and links, opening the agent's T8 tab) | `/t/:teamId/identities` |
| Configuration › External systems | T9 | `/t/:teamId/external-systems` |
| Configuration › Models | T1 *Models* tab (`ListTeamModels`; edit by service admins) | `/t/:teamId/models` |
| Configuration › Log delivery | T14 *Log delivery* tab | `/t/:teamId/delivery/logs` |
| Configuration › Notifications | T14 *Notifications* tab | `/t/:teamId/delivery/notifications` |
| *(not in IA)* Configuration › Configuration values | T7 (missing from the root IA, OQ-W1) | `/t/:teamId/config` |
| Cost › Budget & usage | T5 | `/t/:teamId/budget` |
| Cost › Reports | T11 (T12 per agent) | `/t/:teamId/reports` |
| Cost › Cost tags | T13 | `/t/:teamId/tags` |
| History › Activity & audit | T15 *Activity & audit* tab | `/t/:teamId/history/audit` |
| History › Config revisions | T15 *Config revisions* tab | `/t/:teamId/history/revisions` |

Routes outside the navigation: `/sign-in`, `/auth/callback`, `/signed-out`, and a not-found page that
is also shown for a team or resource the caller cannot see (never revealing that it exists).

### 4.2 Status vocabulary (D24)

Status is a dot plus a word, never colour alone, using only the contract's terms:

| Source | Words shown | Dot |
|---|---|---|
| `status.phase` | Pending, Reconciling | blue (in progress) |
| | Ready | green |
| | Degraded | amber |
| | Failed | red |
| | Deleting | grey |
| Team `state` | Active, Suspended, Deleting, Deleted | green, grey, grey, grey |
| Agent `paused`, pool `state` | Paused (pool: Enabled, Paused, Deleting, Deleted) | grey |
| Condition `BudgetExhausted=True` on a Ready resource | Budget blocked | red |

The console never shows `Running`, `Healthy` or `Blocked (cap)`; root §5.4 still uses them (OQ-W8).

## 5. User stories and acceptance criteria

Criteria are Given / When / Then where it helps. They feed Vitest component tests and the Playwright
e2e suite in the dev environment (§8).

### SDK

**WEB-US-1 · Typed automation.** *(G6; SDK-1, SDK-3, SDK-4, SDK-5)* As a pipeline author, I want a typed
client for every operation.
- A test reads the pinned `openapi.yaml` and the contract's `operationId` → method table; it fails if any
  `operationId` (including `GetHealth`, as `health.get()`) has no method, or any method is not in the table.
- `await afs.teams.update(team, {displayName})` sends `If-Match: "<team.version>"`; a `412` throws
  `AfsError` with `isPreconditionFailed === true`; `await afs.teams.update("team_…", {…})` first sends a
  `GET`, then the `PATCH` with that version, and the result's metadata gives `appliedToVersion`.
- No SDK write is sent without `If-Match`, so the SDK never causes `428`; a `428` from a proxy still maps
  to `isPreconditionRequired === true`.
- Iterating `afs.agents.list(teamId)` follows `nextToken` until absent, making one request per page;
  `.pages()` yields pages with `items` and `nextToken`.
- For each contract error code, a fake response yields the matching getter `true` and every other
  `false`; `code` keeps an unknown string such as `"NewCode"` without throwing.
- No test calls a real API; tests inject a fake `fetch`.

**WEB-US-2 · Authentication.** *(ACC-1, ACC-4; SDK-2)*
- Given a token supplier, every request sends `Authorization: Bearer <token>` from the latest call.
- Given a `401`, the supplier is called once with `forceRefresh: true` and the request is retried once;
  a second `401` throws `isUnauthenticated`; there is never a third attempt.
- Given an API key (`afsk_…`), it is sent as a bearer token and the supplier is not used.
- With a debug hook installed, logged request headers show `Authorization: [redacted]`; an `AfsError`'s
  `message`, `details` and `toJSON()` never contain the token.

**WEB-US-3 · Resilient calls.** *(IF-1; SDK-4, SDK-6)*
- Given `429` with `Retry-After: 2`, the next attempt waits at least 2 s; given a `Retry-After` above
  30 s, the SDK throws `isThrottled` instead of waiting.
- Given `503`, the SDK retries up to 3 times with delays drawn from `[0, min(5 s, 200 ms × 2^n)]`; after
  the last attempt it throws `isUnavailable` carrying the last `requestId`.
- Given `409` with `details.reason = "idempotency_in_progress"` on a create, the SDK waits `Retry-After`
  (1 s) and retries with the same `Idempotency-Key`; any other `409` throws `isConflict` at once.
- A create retried after a network error sends the same `Idempotency-Key` on every attempt; a replayed
  response sets `meta.idempotentReplayed === true`.
- A `PATCH` that fails with a network error is not retried; `400`, `401` (after the one refresh), `403`,
  `404`, `412` and `428` are never retried.
- Aborting the `AbortSignal` during a backoff rejects within 50 ms and sends no further request.

**WEB-US-4 · Waiting, reports and runtimes.** *(TEAM-5, RPT-1..9; SDK-7, SDK-8, SDK-9)*
- `waitFor(agent, {until: ["Ready"]})` polls every 5 s for 2 min then every 30 s; it resolves when the
  phase is `Ready` and `observedGeneration ≥ agent.generation`; it rejects with the status on `Failed`
  or `Degraded`, on `timeoutMs` (default 10 min) and on abort.
- `reports.team(teamId, "usage", {range: "30d", groupBy: ["agent"]})` returns typed `rows`, `totals` and
  `notes`; `.asCsv()` sends `Accept: text/csv` and returns the body byte for byte.
- The same test suite runs in CI under Chromium (Playwright), Bun 1.4 and Node 22.
- A bundle that imports only `AfsClient` and `teams` contains no code from other resources (checked by
  bundling with Vite and searching the output); the core entry is ≤ 25 KB gzip (CI fails above).
- Every export from `src/index.ts` has TSDoc; a lint step fails on an undocumented export.

**WEB-US-5 · Wire fidelity.** *(SDK-10)*
- Given `amountUsd: "1234.50"`, `budgets.get()` returns `"1234.50"` and `budgets.put()` sends `"1234.50"`
  unchanged; no money field is typed `number`.
- Given an unknown `status.phase` value such as `"Hibernating"`, parsing does not throw and the value is
  returned as-is; given an unknown field, it is ignored without error.
- Given `{requestId: "pipeline-42"}` on a call, the request sends `X-Request-Id: pipeline-42`; every
  response's `meta.requestId` and every `AfsError.requestId` carry the server's value.
- `teams.getKubeconfig()` returns the YAML as a string; `secrets.putValue()` resolves `void` on `204`;
  a `502` with an HTML body throws `AfsError` with `status: 502`, `code: "InternalError"` and no body text
  beyond 200 characters.
- Given `X-Afs-Contract-Version` newer than the pinned version, `meta.contractVersion` carries it and the
  `onContractMismatch` hook is called once per client; the console then shows a dismissible "A newer
  version of AFS is available; reload" notice.

**WEB-US-6 · Safe secrets in the SDK.** *(US-6; SDK-11)*
- `secrets.create({…, value})` sends the value once; the SDK never logs request bodies, and its error
  objects, debug hooks and retry diagnostics never include request bodies.
- `apiKeys.create()` returns `secretKey` to the caller only; the SDK keeps no copy. Given a replayed
  create (D51), `secretKey` is `undefined` and `meta.idempotentReplayed === true`.

### Console, all roles

**WEB-US-7 · Sign in.** *(ACC-1; WEB-2, D42)*
- Given one enabled provider, *Sign in* goes straight to it. Given more than one, a picker lists them
  with the default preselected; the last choice (provider id only) is remembered in `localStorage`.
- Given `?provider=idp_…`, the picker is skipped; given `?teamId=team_…`, the console signs in with the
  remembered or default provider and opens that team after sign-in.
- Given `?teamId=` for a team that is not in `GetMe`, the console shows the not-found page with *Sign in
  with another provider* (the team may use a different provider), never confirming that the team exists.
- The authorization request uses PKCE `S256`, `state` and `nonce`; a callback with a wrong `state` or
  `nonce` is refused. The code verifier lives in `sessionStorage` only until the callback, then is removed.
- Access, ID and refresh tokens are held in memory only: after sign-in, `localStorage`, `sessionStorage`,
  IndexedDB, cookies and the URL contain no token (checked in e2e).
- Tokens renew silently 60 s before expiry (refresh token in memory, else a `prompt=none` request); a
  page reload runs a `prompt=none` request and returns to the same route without showing the IdP page
  while the IdP session lasts.
- Given an API `401` that survives the SDK's one refresh, the console shows "Your session has expired",
  keeps the route and non-secret form values in memory, clears secret fields, and re-authenticates.
- *Sign out* clears tokens and the query cache, signs out other open tabs (BroadcastChannel), calls the
  provider's end-session endpoint, and lands on `/signed-out`.
- Given no activity for the configured idle time (default 60 min, `config.json`), the console signs out.

**WEB-US-8 · A shell that follows the API's decision.** *(ACC-3, §5.1, §5.2; WEB-3, WEB-4, WEB-5, WEB-18)*
- `can()` returns `true` only for permissions in `GetMe.teams[teamId].permissions[]`, or for any
  permission when `serviceAdmin` is true, or for `work-orders:read`/`write` when `securityOperator` is
  true (plus `swarm-templates:read`, D37); table tests cover each role's allowed and denied case.
- Given a team-admin of a team with `mayManageAwsAccounts = false`, the S6 filter is read-only with the
  tooltip "Requires service admin" (because `teams:set-aws-accounts` is absent from `permissions[]`),
  and with it `true`, the filter is editable.
- The drift test compares `permission.ts` (every permission and its roles, including
  `security_operator`) with the `-restapi` fixture at the pinned tag and fails on any difference.
- `GetMe` is fetched at sign-in, on window focus when older than 5 min, and after any `AccessDenied`.
- The header shows role and team with the role colour; a security operator sees *Security operator* and
  only *Work orders* and *Swarm templates* in the navigation; team roles never see Governance or Platform items.
- The team switcher lists exactly the teams in `GetMe`; service admins also get *All teams*.
- Every navigation item resolves to a route and screen in §4.1 (test); a viewer never sees *API keys*.
- The header search (D44), focused with `/`, filters teams, agents and pools from lists the caller can
  read (and work orders for security operators) after 2 characters, shows up to 10 matches grouped by
  type, opens the match with Enter, and sends no request other than those list calls.
- An `AccessDenied` from any call shows an alert naming `details.requiredPermission` and the request id.

**WEB-US-9 · Desired vs actual.** *(TEAM-5; WEB-7, D24)*
- Every resource row and detail shows a dot plus a word from §4.2 and, on detail pages, "Generation N,
  observed M"; while `M < N` the page says "Change not applied yet".
- Given a resource in `Pending` or `Reconciling`, its page polls every 5 s; after 2 min of no terminal
  phase it polls every 30 s; on `Ready` or `Failed` polling stops; `Degraded` polls every 30 s.
- Given the tab is hidden, no polling request is sent; on return it refreshes once and resumes.
- Given a list with 50 rows in `Pending`, the page sends one list request per interval, not one per row.
- Given a `429` with `Retry-After: 10`, no polling request is sent for 10 s.
- Given a Ready agent with condition `BudgetExhausted=True`, it shows *Budget blocked*.

**WEB-US-10 · Conflicts and failures.** *(CFG-1; WEB-11, §7 reliability)*
- Given someone else saved the resource, when I save, then a `412` shows "This changed since you opened
  it" with *Reload*; my edits stay visible beside the reloaded values.
- Given the API is unreachable or returns `503` after the SDK's retries, a page banner says "AFS is not
  responding" with *Retry*; open forms keep their non-secret values.
- Every error alert shows the request id with a copy button.

**WEB-US-11 · Secret values never leave the field.** *(SEC-1, US-5, US-6; WEB-8, WEB-6)*
- An e2e test types a random sentinel as a secret value in create and rotate, and receives a sentinel
  `secretKey` from `CreateApiKey`; afterwards the sentinel is absent from the TanStack Query cache and
  mutation cache, `localStorage`, `sessionStorage`, IndexedDB, cookies, the URL and history state,
  captured console output, telemetry payloads, and the DOM once the dialog is closed.
- Secret inputs are masked, have `autocomplete="off"`, and are cleared on submit, cancel and error; the
  value is not held in React state after the request is sent.
- The new API key's `secretKey` is shown once in a dialog with *Copy* and a warning; it is not cached,
  and after the dialog closes only the prefix is ever shown.
- The CLI preview for create-secret shows `--value file://<path>` (never the value).

### Console, service admin

**WEB-US-12 · Service dashboard (S1).** *(US-10, US-15)*
- S1 shows team and agent counts, month-to-date spend against the sum of budgets, reconciler health and
  the top 5 spenders, each linking to the team.
- *Teams needing attention* lists teams expiring within 7 days, budget pressure (≥ 80%), *Budget
  blocked*, `Degraded` agents and reverted drift in the last 24 h, each with the reason and a link.
- A warning banner appears when any team-day is over the variance threshold or price proposals are
  pending, with counts and links to S8 *Reconciliation* and S4.

**WEB-US-13 · Teams (S2).** *(TEAM-1, TEAM-7, BUD-1)*
- The table shows slug, kind, state, agent count, spend against budget, cost center and expiry
  (ephemeral only), filterable by kind and state.
- *Actions* on a selected team: *Suspend*, *Resume*, *Set ceiling*, *Raise ceiling temporarily* and
  *Delete*; delete asks to type the slug; *Set ceiling* refuses a value below the current budget with the
  API's `ValidationError`.
- *Raise ceiling temporarily* (D34) takes an amount and an expiry; the row then shows the override and
  when it ends.
- Given a team-admin or viewer opens `/teams`, the not-found page is shown; they reach their teams
  through the team switcher only.

**WEB-US-14 · Onboard a team (S3).** *(US-1; WEB-6)*
- The wizard has five steps (details, models and network, budget, members, review); *Next* is disabled
  until the step is valid; the review step shows everything and the equivalent CLI command.
- Required service tags appear in step 1 with their allowed values as a select; the team cannot be
  created without them; a server `ValidationError` highlights the named fields.
- The sign-in provider select appears only when more than one provider exists, with the default chosen.
- After *Create*, the team appears in S2 as `Reconciling` and updates to `Ready` without a page reload.

**WEB-US-15 · Model prices (S4).** *(US-10)*
- S4 lists models with effective-dated prices; pending proposals show old and new prices; *Approve* and
  *Reject* ask for confirmation and an optional note; after success the row moves to the price history
  with the approver and time.

**WEB-US-16 · Audit log (S5).** *(US-13, US-14)*
- Filters by team, actor, action, outcome (allowed, denied) and time range, as API query parameters.
- Denied requests show *Denied* with the permission required; drift corrections show *Drift corrected*
  with the object.
- *Download CSV* returns what `ListAdminAuditEvents` returns with `Accept: text/csv` for the same filters.

**WEB-US-17 · Team AWS account access (S6).** *(US-7, TEAM-8)*
- The filter takes glob patterns over account ids and names; the matching organization accounts list
  shows the pattern that matched and the number of agent links per account.
- Given a change that narrows the filter, *Save* first shows which links will be disabled and asks to
  confirm.
- The *Team manages its own accounts* switch is editable by service admins only; given it is off, a
  team-admin sees the filter read-only with "Requires service admin" and the API returns `403` if called.

**WEB-US-18 · External systems catalog (S7).** *(US-8, EXT-1..6)*
- Built-in systems have no *Delete*; service admins add, edit and delete custom systems with endpoints.
- The service-level switch turns a system off for every team; teams then show it *Off for all teams*.
- Enabling an *Unmetered* system (OpenAI, OpenRouter) requires a confirmation that names what is not
  counted in budgets or stopped by caps.
- Below the catalog, service admins choose which teams may declare their own systems.

**WEB-US-19 · Cost allocation tags (S9).** *(US-12, TAG-7; WEB-19)*
- System tags are listed read-only; service tags can be added, edited and removed (fixed or required,
  allowed values, default); teams missing a required value are listed with links.
- Spend can be grouped by any tag key, with *(untagged)* shown separately.
- Each key shows its tag status (seen in CUR, first and last seen, AWS activation). Given a key not seen
  in CUR 3 days after activation, it is flagged.
- The one-time "activate cost allocation tags in AWS Billing" banner stays until a service admin
  acknowledges it; team roles never see S9 and its API calls return `403`.

**WEB-US-20 · Service settings (S10).** *(ACC-1, ACC-4, AGT-9; WEB-16)*
- *Settings* lists every key from `GetSettings` with value, default, allowed range and last change;
  *Edit* validates the range before sending `PutSetting` with `If-Match`.
- *Identity providers*: add, edit and disable Okta or Entra ID providers (issuer, client id, groups
  claim) and choose the default; the list shows the teams using each; *Disable* is disabled for a
  provider in use, and the API's `409` is shown if it races; any client secret is entered write-only
  (WEB-US-11) and only its ARN is shown.
- *Storage classes*: add, edit and remove the classes T3 offers and mark the default; a class in use
  cannot be removed (`409` lists the agents).
- *Agent templates*: see WEB-US-22.
- *Service API keys*: create keys with the `security_operator` role only, shown once (WEB-US-11), with
  expiry ≤ 90 days; list shows prefix, expiry and last use.
- *Security operators*: add or remove users and IdP groups.
- Given a team-admin, S10 is not in the navigation and its routes show the not-found page.

**WEB-US-21 · Export and import (S11).** *(US-13, CFG-4..6; WEB-17)*
- *Create export* starts `CreateExport`, shows its progress, and lists past exports with size, checksum
  and download link; a note says the bundle holds no secret values.
- *Import* takes a bundle and an account map (source → target account ids); *Dry run* is the default and
  shows the plan (create, update, skip per resource); *Apply* is enabled only after a dry run of
  the same inputs and asks for confirmation.

**WEB-US-22 · Agent templates (S10 tab).** *(AGT-2, AGT-11; WEB-20)*
- Service admins add and edit templates (name, description, harness, default resources, allowed image
  digests with one marked current) and enable or disable each; every change shows in the template's
  revisions.
- T3 and *Create pool* list only enabled templates, prefill the default resources, and offer only the
  template's allowed digests with the current one preselected.
- Given a template is disabled or a digest removed, agents and pools using it keep running and show the
  condition `TemplateRetired=True` as "Template retired" in T2 and P4; *Edit* asks for a new template
  or digest.

**WEB-US-23 · Guardrails: isolation tier and viewer kubectl.** *(US-18, TEAM-6, ACC-5; WEB-14, WEB-15)*
- On team detail, service admins set the isolation tier (*shared* or *dedicated*) and the viewer kubectl
  switch; both changes ask for confirmation and show the CLI command.
- Given a team-admin or viewer, both controls are disabled with "Requires service admin"; a direct
  `UpdateTeam` with those fields returns `403`, shown as an access-denied alert.
- Given kubectl on, T1 and V1 show *Download kubeconfig* (YAML from `GetTeamKubeconfig`, saved as a file)
  and `afs teams get-kubeconfig --team-id …`; given it off, neither is shown and the API returns `403`.

### Console, team-admin

**WEB-US-24 · Team overview (T1).** *(US-2, US-13, TEAM-5)*
- T1 shows namespace, cluster, IAM role ARN (copyable), cost center, phase with conditions (type, status,
  reason, message, time), budget burn against amount, agent health counts and recent activity.
- The *Models* tab lists the team's enabled models; only service admins can edit it.
- A *Work orders* card lists work orders assigned to the team or touching its repositories
  (`ListTeamWorkOrders`), read-only.
- *Suspend* and *Resume* are in *Actions*; *Edit* changes display name, description, owner and sign-in
  provider (among the enabled providers).
- Given the team is *Suspended* (TEAM-9), every page of the team shows a banner and every mutating
  control except *Resume* and *Delete* is disabled with "Team is suspended"; a racing `409` is shown as
  that message.

**WEB-US-25 · Agents (T2).** *(US-4, AGT-1..10)*
- The table shows name, status (§4.2), model, template, bound secrets and month-to-date cost; there is no
  replica column and no *Scale* action.
- The detail panel offers *Restart*, *Pause*/*Resume*, *Edit*, *Take snapshot* and *Expand volume*;
  restart and pause ask for confirmation.
- *Expand volume* accepts only a size larger than the current one; a smaller value is refused client-side
  and by the API.
- The *Identities* tab lists external identities (AGT-5) with add and remove; tabs for usage (T12), logs
  and revisions open in the panel.
- Viewers see the same panel with every action disabled ("Requires team-admin").

**WEB-US-26 · Create agent (T3).** *(US-4, US-5; WEB-6)*
- The form takes template (enabled only), image digest (from the template's allowed digests), persona, model (only the team's),
  resources, storage (size, class, on-delete, snapshots), AWS identity, secret bindings (env name or file
  path) and configuration values; there is no replica field. A tag-only image is refused with the API's
  `ValidationError` on the image field.
- A short help panel says secrets and configuration arrive as environment variables and files, with no
  change to the agent's code.
- Secret binding lists only the team's shared secrets and this agent's own secrets.
- *AWS identity* chooses the team's shared role or a dedicated role; given the agent has cross-account
  links, switching back to the shared role is disabled with "Remove cross-account roles first".
- *Use namespace value* is offered only when the namespace has a value of that name; the effective value
  is shown beside each name.
- Binding a secret to an env var already used by a configuration value is blocked client-side and by the
  API.
- The side panel shows the equivalent CLI command and updates as the form changes.

**WEB-US-27 · Secrets (T4).** *(US-6; WEB-8)*
- The create dialog takes scope, name, description, optional external system and value (masked); the
  managed path is previewed; after submit the value field is cleared and never shown again.
- The table shows scope, managed path, usage, rotation and last change; the value column always reads
  "Write-only".
- Rotate asks for the new value and warns which agents will restart.
- Deleting a bound secret shows the API's `409` with the agents that use it, each linked.

**WEB-US-28 · Budget and usage (T5).** *(US-9, BUD-1..5)*
- T5 shows month-to-date spend, month-end forecast with projected cap date, action at exhaustion, latest
  reconciliation, daily spend split into Bedrock tokens and EKS compute, and spend by agent.
- *Edit budget* takes amount, thresholds and (service admins only, persistent teams only) the action at
  exhaustion (D33); an amount above the ceiling is refused client-side with the ceiling named, and by the
  API with `ValidationError`.
- A link opens T14 *Notifications*, where threshold alerts are delivered.

**WEB-US-29 · Members and API keys (T6).** *(US-2)*
- Team-admins add people (by email) or IdP groups as team-admin or team viewer; there is no
  `service_admin` choice, and a crafted request for it is refused by the API.
- *API keys* creates a key with name, role and expiry (≤ 90 days, default 30); the secret is shown once
  (WEB-US-11); the list shows prefix, role, expiry and last use.
- Given a viewer, membership controls are disabled with "Requires team-admin" and the *API keys* tab is
  not shown (D49).
- The page shows the team's sign-in provider; team-admins can change it among the enabled providers.
- Given a `CreateApiKey` retry is replayed without `secretKey` (D51), the dialog says the key was created
  but cannot be shown again, and offers *Delete key*.

**WEB-US-30 · Configuration values (T7).** *(US-5, CFG-7)*
- The namespace table shows name, value, description and how many agents use each; the agent table shows
  source (*Namespace* or *Agent value*) and effective value.
- A name that looks like a credential (`*password*`, `*secret*`, `*token*`, `*key*`) is refused with a
  link to Secrets.
- Saving a namespace value warns which agents will restart; deleting a value that agents link to is
  refused with the agents listed.
- Viewers see both tables read-only.

**WEB-US-31 · Agent AWS access (T8).** *(US-7, AGT-6, AGT-10)*
- The tab shows the identity (shared or dedicated), role ARN and Pod Identity association, and the
  accounts the team may use.
- *Add cross-account role* is enabled only for a dedicated identity; it offers only accounts inside the
  team's filter and takes role ARN, profile name and maximum session length.
- After adding, the trust policy (with the generated external ID) is shown with *Copy*; status reads
  *Pending trust* until *Verify now* succeeds, then *Verified*, or *Failed* with the reason.
- Viewers see identity, links and trust policies read-only.

**WEB-US-32 · External systems (T9, T10).** *(US-8)*
- Switches show the inherited state; a system off at a higher level is shown off and disabled with the
  level named; unmetered LLM systems carry the *Unmetered* badge.
- *Declare system* appears only when the team's `mayAddExternalSystems` is true.
- Given a team-admin switches a system off for one agent, T10 shows *Off at agent level* within one
  polling interval.

**WEB-US-33 · Team tags (T13).** *(US-12)*
- Shows system, service and team tags with their source; team-admins edit required values and their own
  tags; fixed tags and system tags are read-only; viewers see everything read-only.
- Tags dropped from Bedrock request metadata because of the 16-pair limit (D27) are listed.

**WEB-US-34 · Log delivery and notifications (T14).** *(OPS-1, BUD-2; WEB-21)*
- *Log delivery* lists destinations (CloudWatch, S3, OTLP, Splunk HEC, Datadog) with status and last
  delivery; team-admins add, edit and delete them; credentials are chosen as secret references, never
  typed into the form.
- *Notifications* lists channels (Slack, email, webhook, Jira) with the events each receives and its
  delivery status; *Send test* sends one test message and shows the result.
- Deleting a channel used by a report schedule lists the schedules first.
- Viewers see both tabs read-only.

**WEB-US-35 · History (T15).** *(US-13, US-14, CFG-2, CFG-3; WEB-22)*
- *Activity & audit* lists the team's audit records (actor, action, resource, outcome, request id) with
  the S5 filters and CSV download.
- *Config revisions* lists revisions per resource with author and time; selecting two shows a diff.
- *Restore* first runs `RestoreRevision` with `dryRun` and shows the plan; *Apply* then sends the restore
  and asks for confirmation; viewers can view and diff but *Restore* is disabled ("Requires team-admin").

### Console, viewer

**WEB-US-36 · Read-only that explains itself (V1, V2).** *(US-2)*
- Every control that changes state is visible but disabled with "Requires team-admin"; no request that
  would change state can be sent from a viewer session (tested by asserting no mutating `fetch`).
- Secrets show names, paths, usage and rotation; there is no value column with content.

### Reports, all roles

**WEB-US-37 · Reports and scheduling (S8, T11, T12).** *(US-11, D23; WEB-9)*
- Range picker (24 h, 7, 30, 90 days, month to date, custom); filters; group by incl. tag; *Download
  CSV* downloads exactly what the API returns for the same query.
- Activity views show working, idle and other states, utilization, and *idle since* for idle agents.
- Every report page shows the API's `notes`, including "Spend with providers other than Bedrock is not
  included"; external traffic shows counts and bytes, never a cost.
- S8 has a *Reconciliation* tab listing team-days over the variance threshold.
- Given a viewer of team A, S8 and other teams' reports are not in the navigation and their routes show
  the not-found page.
- *Schedule report* (T11) offers only the team's own notification channels and cadence daily, weekly or
  monthly; a `ValidationError` for a service-level channel is shown on the channel field; schedules list
  next run, last run and last status with the error.
- Given a viewer, *Schedule report* is disabled with "Requires team-admin" (D23).

### Budgeted workloads, swarms and CVE remediation

**WEB-US-38 · Budgeted POC (P2).** *(US-15)*
- Choosing *Ephemeral* in S3 adds lifetime budget, expiry (no later than the service maximum) and teardown
  rule to the budget step; *Next* stays disabled until all three are set; the review shows them.
- The teardown rule defaults to *at cap or expiry*; the step shows an estimated daily cost and the date
  the cap would be reached.
- An ephemeral team's overview shows time to expiry, spend against the cap and, after teardown, when and
  why it was torn down.

**WEB-US-39 · Pools and stages (P4).** *(US-17; WEB-12)*
- The page lists stages in order and, in each, pools with template, model, desired and reporting workers
  (working, idle, impaired), handoffs, storage, shared role and the accounts it is linked in, and spend.
- *Create pool* has the create-agent sections (template, image, model, secrets, configuration) plus
  workers (0–200), stage, handoffs, scratch size (1–500 GiB per worker) and optional shared EFS volume.
- The pool name is checked against the team's agent and pool names and cannot be edited after create.
- *Shared named role* takes one role name and links it in one or more accounts inside the team's filter;
  accounts outside the filter are not offered.
- *Scale* accepts 0–200 and shows the CLI command; *Pause*, *Resume* and *Delete* ask for confirmation.
- Viewers see every control disabled with "Requires team-admin"; the navigation item is absent for
  persistent teams.

**WEB-US-40 · Work orders (P3, P6).** *(US-16, D37, D38; WEB-13)*
- A security operator signs in to a console with only *Work orders*; the list filters by status,
  severity, SLA state and team, showing team names from `ListTeamDirectory`.
- *Create work order* takes CVE, severity, SLA, template (from `ListSwarmTemplates`, enabled only), cap
  and repositories with an owner each: a team picked from `ListTeamDirectory` by slug or name, an email,
  or both. It shows the CLI command with `--repos host/owner/repo=team_…,ops@example.com`.
- A second work order for an open CVE shows the API's `409` with a link to the existing one.
- The detail shows SLA state, remediation team with spend against cap, one row per repository with
  status, PR link and notifications sent; *Cancel* asks for a reason.
- A team-admin or viewer of an owning team sees the work order read-only, with only their repositories'
  rows; opening a work order with no link to their teams shows the not-found page (API `404`).

**WEB-US-41 · Swarm templates (P5).** *(WO-2)*
- Service admins create and edit templates (stages, pools, handoffs, secrets needed, configuration, cap,
  TTL, teardown), see revisions, and enable or disable a template; a disabled template is not offered
  in *Create work order*.
- Security operators see *Swarm templates* in the navigation, read-only (D37); team roles do not see
  the page.

### Quality

**WEB-US-42 · Accessible and true to the mockups.** *(NFR; WEB-1, WEB-5, WEB-10)*
- Every screen passes automated axe checks with no serious or critical issues; all flows complete by
  keyboard only; status changes are announced through live regions.
- Every screen has a Playwright visual snapshot at 1440 × 900 with the mockup's fixture data; the first
  baseline is approved side by side with the mockup by the owner (§8), and later diffs above 0.5% of
  pixels fail CI until re-approved.

## 6. Architecture, hosting and configuration

### 6.1 Clean architecture (console)

`presentation` → `application` → `domain`; `infrastructure` → `application` → `domain`; only `main/`
imports `infrastructure`; `presentation` never imports `@afs/sdk`. `src/architecture.test.ts` enforces
it. Use cases are the console's API; server-state caching (TanStack Query) wraps use cases in
`presentation`. The domain models `Me` as the contract shapes it (`principal`, `serviceAdmin`,
`securityOperator`, `teams[{teamId, slug, role, permissions[]}]`); the current `Principal`/`bindings`
model in `domain/permission.ts`, which has no `security_operator` and only part of the catalog, is
replaced in M0.

### 6.2 Hosting and runtime configuration (D43)

- **Static bundle on S3 + CloudFront**, one distribution per environment (dev, stage, prod). One build
  artifact is promoted unchanged across environments.
- **Runtime config** from `/config.json`, fetched at boot with `no-cache`: `apiUrl`, `environmentName`
  (shown in the header), `redirectUri`, `providersFallback` (used only if `ListSignInProviders` fails),
  `telemetryUrl` (optional), `idleTimeoutMinutes`. A missing or invalid file shows a configuration error
  page, not a blank screen. No `VITE_*` value differs per environment.
- **OIDC clients:** one public (SPA) client per provider per environment, PKCE required, redirect URI
  `https://<console origin>/auth/callback`; client ids come from `ListSignInProviders`.
- **Caching:** hashed assets `max-age=31536000, immutable`; `index.html` and `config.json` `no-cache`;
  unknown paths fall back to `index.html`.
- **Headers** (CloudFront response headers policy): CSP `default-src 'self'; script-src 'self';
  connect-src 'self' <apiUrl> <issuer origins> <telemetryUrl>; frame-ancestors 'none'; object-src 'none'`
  (no `unsafe-inline` scripts), HSTS, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.
- **CORS** is allowed by `afs-api` only from origins in setting `api.cors_origins`; it must allow headers
  `Authorization`, `Content-Type`, `If-Match`, `Idempotency-Key`, `X-Request-Id` and expose `ETag`,
  `X-Request-Id`, `Idempotent-Replayed`, `Retry-After` (dependency, §9).

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | First contentful paint < 1.5 s and route changes < 300 ms with cached data, on a reference laptop (4 cores, 16 GB, 50 Mbit/s, 40 ms RTT to the API); initial route bundle ≤ 300 KB gzip |
| SDK size | Core (`AfsClient`, errors, pagination, retry) ≤ 25 KB gzip; each resource client ≤ 3 KB gzip; checked in CI |
| Browsers | Last 2 major versions of Chrome, Edge, Firefox and Safari; minimum viewport 1024 px |
| Reliability | API down or `503`: banner with *Retry*, no loss of non-secret form input; `429`: polling paused per `Retry-After` and a non-blocking "Slowing down" notice; a failing widget shows its own error without blanking the page; session expiry handled per WEB-US-7 |
| Observability | Web Vitals (LCP, INP, CLS) and uncaught errors sent to `telemetryUrl` when configured, with route templates (no ids, no query strings), build version and request ids only; no PII (names, emails), no tokens, no form values, no secret values (WEB-US-11 sentinel check covers telemetry) |
| Security | CSP without `unsafe-inline` scripts; tokens in memory only; no secret value in state, URL, storage, logs or telemetry; OWASP ASVS L2 |
| Quality | `domain` and `application` ≥ 90% coverage; denied-case test for every permission rule; `bun run gate` before every commit |
| Accessibility | WCAG 2.2 AA |

## 8. Testing approach

- **Unit and component:** Vitest; use-case tests with in-memory fake ports; SDK tests with a fake `fetch`.
- **Contract:** the SDK coverage test (WEB-US-1) and the permission drift test (WEB-US-8) run against the
  pinned `-restapi` tag; the contract's OpenAPI examples are replayed through the SDK.
- **End to end:** Playwright against the dev environment for the Given/When/Then criteria, including the
  sentinel secret test (WEB-US-11) and token storage checks (WEB-US-7).
- **Visual:** Playwright snapshots per screen (WEB-US-42). **Owner: the web lead**, who approves each
  first baseline against the mockup and every re-baseline; J signs off the S-, T-, V- and P-series once.

## 9. Dependencies

| Milestone | Needs from others | Owner |
|---|---|---|
| All | `openapi.yaml` from a `-restapi` release tag, pinned in `packages/sdk` with its checksum; the contract's explicit `operationId` → SDK method table | `-restapi` |
| All | Permission catalog fixture (`authz` roles and permissions as JSON) exported with each `-restapi` release (to be added to the `-restapi` PRD) | `-restapi` |
| All | CLI command and flag names (contract CLI column, `-cli` kebab rules) for WEB-6 previews | `-cli` |
| All | Approved mockups for each screen (root `docs/ui/`); S10, S11, T14 and T15 have none and follow the S2 table pattern until they do | root |
| M0 | Contract tag with `GetMe`, `ListSignInProviders`, `GetHealth`; `api.cors_origins` and the CORS headers in §6.2 | `-restapi` |
| M0 | S3 bucket, CloudFront distribution, response headers policy and `config.json` per environment | platform (Terraform) |
| M0 | IdP SPA app registrations in Okta and Entra ID per environment (PKCE, redirect URIs, refresh token rotation, groups claim) | J / IdP admins |
| M0 | Dev environment with seeded test users per role for e2e | platform |
| M1–M6 | A contract tag holding each milestone's operations before the console work starts (M1 teams, members, settings, identity providers; M2 agents, secrets, config, external systems, storage classes, agent templates (needs the `-db` `agent_templates` table, D53); M3 budget, usage, reports, notifications; M4 audit, tags, accounts, role links, exports, log delivery; M5 pools, kubeconfig, cost tag status; M6 work orders, swarm templates, `ListTeamDirectory`, service keys) | `-restapi` |

## 10. Delivery

Milestones match the root §9. Placement of S10, S11, T14 and T15 is this PRD's proposal until root §9
names those screens; it follows the requirement ids root §9 already places (for example CFG-5/6 and
OPS-1/3 in M4).

| Root milestone | This repository |
|---|---|
| M0 Foundations | SDK-1..6, SDK-9..11 pipeline; console shell, WEB-2 sign-in, WEB-3, WEB-4 (`GetMe`, catalog, drift test), WEB-5 shell and search, WEB-18 routes; hosting (§6.2) |
| M1 Teams & access | S1–S3, T1, T6, V1; S10 *Settings* and *Identity providers*; T15 audit and revisions (restore in M4); WEB-6, WEB-7, WEB-11; SDK-7 |
| M2 Agents & secrets | T2–T4, T7, T9, T10, S7, V2; S10 *Storage classes* and *Agent templates* (WEB-20); WEB-8 |
| M3 Spend control | T5, S4, S8, T11, T12; T14 notifications; WEB-9 (without scheduling); SDK-8 |
| M4 Production readiness | S5, S6, S9, T8, T13; T14 log delivery; S11 export and import (WEB-17); report scheduling (RPT-8); T15 restore; agent identities (AGT-5) |
| M5 Budgeted workloads and swarms | P2, P4 (WEB-12); isolation tier (WEB-14); viewer kubectl (WEB-15); cost tag status (WEB-19, TAG-7) |
| M6 CVE remediation | P3, P5, P6 (WEB-13); security operator role; S10 *Service API keys* and *Security operators*; feature complete |

## 11. Definition of done (every change)

- [ ] SDK regenerated from the pinned contract when it changed; public surface documented
- [ ] Dependency rule holds (`architecture.test.ts` green)
- [ ] Controls gated by `can(...)` from `GetMe`, and `AccessDenied` from the API handled
- [ ] No secret value in state, URL, storage, logs or telemetry; no token in `localStorage`
- [ ] Accessible; visual snapshot approved against the mockup; equivalent CLI shown on create forms
- [ ] Status shown with the §4.2 vocabulary only
- [ ] `bun run gate` green; stories' acceptance criteria covered

## 12. Open questions and decisions

### 12.1 Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| OQ-W1 | Mockups for S10, S11, T14 and T15; add *Configuration values* (T7) to the root IA and its navigation table; place S10, S11, T14 and T15 in root §9 | root (J) | M1 |
| OQ-W2 | Should `ListSignInProviders` accept `?teamId=` and return that team's provider, so a `?teamId=` deep link picks the right provider before sign-in (it would reveal which provider a team id uses)? | `-restapi` / J | M1 |
| OQ-W3 | How CSV responses paginate (token in a header or a trailer), so `asCsv()` can fetch every page and keep one header row (D39) | `-restapi` | M3 |
| OQ-W4 | Telemetry backend for Web Vitals and errors (CloudWatch RUM or the OpenTelemetry collector) | platform | M1 |
| OQ-W5 | Idle sign-out default: 60 min proposed; confirm against the enterprise session policy | J | M0 |
| OQ-W6 | Revisit push status (SSE) instead of polling if reconcile lag or rate limits make polling costly | web lead | after M3 |
| OQ-W7 | Whether the web and CLI share golden CLI-command fixtures for WEB-6 | `-cli` / web lead | M1 |
| OQ-W8 | Root §5.4 key flows say `Running`, `Blocked (cap)` and `Healthy`, which D24 replaces; root to align | root | M1 |
| OQ-9 | IdP-to-IAM federation for viewer kubectl (shapes the *Download kubeconfig* instructions) | J | M5 |

### 12.2 Decisions applied here

| # | Decision | Where |
|---|---|---|
| D23 | Report scheduling for team-admins and service admins only; viewers run reports on demand | WEB-9, WEB-US-37 |
| D24 | Contract status vocabulary only; *Budget blocked* for `BudgetExhausted=True` | §4.2, WEB-7 |
| D34 | Temporary ceiling raise with expiry, service admins only | WEB-US-13 |
| D37 | Security operators read swarm templates | WEB-US-8, WEB-US-41 |
| D38 | Work order owners resolved through `ListTeamDirectory` (id, slug, displayName) | WEB-13, WEB-US-40 |
| D40 | SDK safe writes: resource `version` as `If-Match`; id-only calls read first | SDK-4 |
| D42 | Provider picker and deep links; `can()` from `GetMe` permissions; catalog for tooltips and drift test | WEB-2, WEB-4 |
| D43 | S3 + CloudFront, runtime `config.json`, CORS from `api.cors_origins` | §6.2 |
| D44 | Header search is a client-side filter; no search API | WEB-5, WEB-US-8 |
| D47 | `X-Afs-Contract-Version` exposed by the SDK; console shows a reload notice when newer | SDK-10, WEB-US-5 |
| D49 | *API keys* tab only for team-admins and service admins | WEB-US-29 |
| D51 | A replayed `CreateApiKey` never returns the key again | WEB-US-6, WEB-US-29 |
| W-1 | Polling 5 s for 2 min, then 30 s; stop on `Ready`/`Failed` or hidden page; `waitFor` uses the same cadence | WEB-7, SDK-7 |
| W-2 | `GetMe` refetched at sign-in, on focus after 5 min and after any `AccessDenied` | WEB-US-8 |
| W-3 | Visual snapshots approved against mockups by the web lead; 0.5% pixel threshold | §8 |
