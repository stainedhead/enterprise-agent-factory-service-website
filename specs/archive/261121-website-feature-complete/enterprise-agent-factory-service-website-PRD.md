# Enterprise Agent Factory Service — SDK and console PRD (`-website`)

| | |
|---|---|
| **Status** | Feature complete (initial scope, archived spec `261121-website-feature-complete`). **Paperclip collaboration change added 2026-11-22**: SDK-12..16, WEB-23..36, WEB-US-43..61, milestones C1-SDK to C4 (§10.1), reviewed with `review-prd` the same day (§13). Not started; the pinned contract is still v1.1.0 (SDK-16) |
| **Change** | [Paperclip team collaboration PRD](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/paperclip-team-collaboration-PRD.md) (§6 requirements COL-*, SEC-7; §7.4 and §7.5 stories), API contract v1.3.0 (§3, §4.4b, §4.4c), mockups T16 and V3 |
| **Author** | J (Enterprise Architecture), drafted with Claude |
| **Parent** | [Root PRD](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/enterprise-agent-factory-service-initial-PRD.md) (§4 roles; §5 UX, IA and screens; §6.14 stories US-1..US-26; §9 release plan; §10.1 decisions D23–D57); [Paperclip change PRD](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/paperclip-team-collaboration-PRD.md) (US-27..US-33, ADR-016) |
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
| Team collaborator (new, PC-D6) | Console, read-only except in Paperclip | Everything a viewer does, plus write in the team's Paperclip and use its REST API through the public endpoint; no AFS administration |
| Team viewer | Console, read-only | Status, usage, costs and history; understands what they cannot change and why |
| Security operator | Console (*Work orders* only), service API key | Create and track CVE work orders across teams |
| Pipeline or tool author | `@afs/sdk` | Automate any operation with typed calls, safe retries and pagination |

### 1.1 The Paperclip change: problem and goals

**Problem.** The feature-complete console and SDK know nothing of Paperclip, the board, chat and roster that the Agentic Teammates design gives each team. A team-admin cannot create the one collaboration agent, switch its public web UI and REST API, connect the team's agents to it or see who used it;
viewers and the new *team collaborator* role cannot find it or understand what they may do there; service admins cannot allow or forbid public collaboration per team and service-wide; and `@afs/sdk` has no typed calls for any of it. The API and contract for this exist (API contract v1.3.0); this repository's job is the typed client and the screens.

| ID | Goal | Measure |
|---|---|---|
| WG1 | A team-admin gives the team a Paperclip from the console without a platform ticket | From T3 submit to T16 showing the agent `Ready` and its hostname, with no page reload and no manual step (e2e on the fake API; PG1's 15 minutes is the platform's) |
| WG2 | Every role sees, in the console, exactly what it may do with collaboration | Permission table tests for all five new permissions across roles; V3 and every collaboration control disabled with the right tooltip; no mutating request from a viewer or collaborator session |
| WG3 | The public surfaces are never switched on by accident or without knowing why they are off | Confirmation before turning a surface on; every blocked switch names its reason (§5, WEB-US-44) |
| WG4 | No secret or Paperclip content ever enters the console | Sentinel scan over T16 and T4 finds nothing; no Paperclip key field exists |
| WG5 | The SDK covers the new contract completely and releases first | Operation coverage test green at v1.3.0; `@afs/sdk` released (minor) before any console story starts |

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
- **No client-side workflows** that hide several mutations behind one button beyond what one API call does. The one exception is T16's bulk *Connect* / *Disconnect*, which sends one call per selected agent and shows each result (WEB-US-48, WP-D5).
- **No Paperclip inside the console** (Paperclip change): no iframe, embed, proxy or rendering of Paperclip content, and no call from the browser or the SDK to a team's collaboration hostname; *Open Paperclip* is a plain link that opens a new tab. The console has no field for a Paperclip key (the key is stored through the existing secret dialogs, write-only).
- **No change of a collaboration agent's role** after create, no choosing of a hostname (it is `<team-slug>.<collab.base_domain>`), and no Paperclip push or pool connection (root change PRD non-goals).

## 3. Requirements owned

The **AC** column names the stories in §5 whose criteria prove each requirement.

### 3.1 SDK

SDK-12..SDK-16 are the Paperclip change and are built first (milestone C1-SDK, §10.1).

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
| SDK-12 | **Collaboration resource** (Paperclip PRD COL-34, API contract §4.4b). Generated from the pinned contract: `collaboration.get(teamId)`, `collaboration.put(resource \| {teamId, version}, body)`, `collaboration.links.list(teamId, {linkState?, connect?})` (async iterator and `.pages()`), `collaboration.connectAgent(teamId, agentId, {paperclipAgentId?})`, `collaboration.disconnectAgent(teamId, agentId)`, `collaboration.rotateKeys(teamId, {names?})` and `admin.collaborationEndpoints.list({teamId?, state?})` (iterator, `.pages()`, `asCsv()`). Types `TeamCollaboration`, `CollaborationLink`, `CollaborationEndpoint` and `RotateCollaborationKeysResult` are exported. `put` follows SDK-4 (`If-Match` from the resource's `version`; given only an id it reads first). `connectAgent`, `disconnectAgent` and `rotateKeys` get a generated `Idempotency-Key`. The resource adds at most 3 KB gzip (SDK size rule) | COL-34, COL-35 | P0 (get, put, connect, disconnect), P1 (links, rotate), P2 (endpoints) | WEB-US-43 |
| SDK-13 | **Fields added to existing resources.** `Agent.role` (`worker` \| `collaboration`, create-only) and `Agent.collaboration` (`{connect, paperclipAgentId?, linkState, lastSyncedAt?, lastError?}`), `agents.list(teamId, {role?})`, `agents.create()` accepting `role` and `collaboration`; `Team.mayExposeCollaboration` on `teams.create()` and `teams.update()`; `Secret.managedBy` (`user` \| `afs` \| `paperclip`) and `secrets.list(teamId, {managedBy?})`; `AgentTemplate.capabilities` (`paperclip`), `agentTemplates.list({capability?})` and `admin.agentTemplates.put()` accepting `capabilities`; `IdentityProvider.collabClientId` and `collabClientSecretArn` on the admin identity provider methods (never on `ListSignInProviders`); role `team_collaborator` on `Member.role`, `ApiKey.role` and `Role` unions; report kind `collaboration` on `reports.team()` and `reports.service()` with `groupBy` `surface`, `reason`, `person`, typed measures `signIns`, `uniquePeople`, `requests`, `deniedRequests`, `secretDetections` and row fields `principal` and `serviceAdminEntry`. All enums stay open unions (SDK-10) | COL-1, COL-10, COL-34, COL-36, SEC-7, ACC-2 | P0 (P2 for the report) | WEB-US-46 |
| SDK-14 | **Endpoint helper.** `collaboration.endpointUrl(teamId)` (hand-written, `src/resources/collaboration.ts`) calls `GetTeamCollaboration` once and returns `{webUi: string \| null, restApi: string \| null, hostname: string \| null}` where a URL is non-null only when that surface is effective (`effective.webUi` / `effective.restApi`). It never calls the edge, never proxies a Paperclip request and never accepts, stores or logs a Paperclip key | COL-19, COL-34 | P0 | WEB-US-43 |
| SDK-15 | **Errors and wire fidelity for the new contract.** `AfsError.isSecretDetected` (code `SecretDetected`, status 422; returned only by the edge, so the SDK never sees it from `afs-api`, but the getter completes the per-code set of SDK-5); exported constants for the new `details.reason` values (`collaboration_agent_exists`, `collaboration_agent_missing`, `managed_secret`, `hostname_held`, `team_suspended`, `master_key_not_rotatable`, `reserved_name`, `managed_registration`, and the `ValidationError` field reasons `collab_base_domain_unset`, `collab_public_endpoints_off`, `collaboration_not_allowed_for_team`, `provider_without_collab_client`, `collaboration_agent_not_ready`) so callers do not hard-code strings; unknown reasons still pass through as strings. `TeamCollaboration.hostname`, `webUiUrl` and `restApiUrl` may be `null` and are typed so | IF-3 | P0 | WEB-US-47 |
| SDK-16 | **Contract resync.** The pin in `packages/sdk/contract/` (`openapi.yaml`, `permissions.json`, `operations.json`, `contract.lock.json`) is resynced with `bun run contract:sync` to the `-restapi` release tag that carries API contract v1.3.0 (today it holds v1.1.0 content). `contract.lock.json` then records `contractVersion` `1.3.0` (or the later tag's), the new tag and its checksums; the `operationId` → method table check (WEB-US-1) covers the seven new operations; `permissions.json` carries the `team_collaborator` role and the five `collaboration:*` permissions. Generated code is regenerated by `codegen`, never hand-edited. This PRD update does not touch the pin | IF-3 | P0 | WEB-US-43 |

### 3.2 Console

WEB-23..WEB-36 are the Paperclip change (milestones C1 to C4, §10.1).

| Id | Requirement | Product reqs | Pri | AC |
|---|---|---|---|---|
| WEB-1 | Every screen in root §5.3 (S1–S11, T1–T16, V1–V3, P2–P6; T16 and V3 are the Paperclip change), each matching its approved mockup in the root `docs/ui/` (or, for S10, S11, T14 and T15, which have none, the S2 table pattern), checked by Playwright visual snapshots (§8) | IF-4 | P0–P2 | WEB-US-12..42 |
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
| WEB-16 | Service settings (S10): settings keys, identity providers, storage classes, agent templates (WEB-20), service notification channels (OPS-5), service API keys and security operators | ACC-1, ACC-2, ACC-4, AGT-9 | P0–P2 | WEB-US-20 |
| WEB-17 | Export and import (S11): create and download an export bundle; import with dry-run plan and account map | CFG-4..6 | P1 | WEB-US-21 |
| WEB-18 | Every IA navigation item maps to a screen id and route (§4.1); a test fails if a navigation item has no route or a route has no screen | §5.2 | P0 | WEB-US-8 |
| WEB-19 | S9 shows cost allocation tag status per key and the one-time activation banner until acknowledged | TAG-7 | P2 | WEB-US-19 |
| WEB-20 | S10 *Agent templates* tab (AGT-11) for service admins; T3 and *Create pool* offer only enabled templates and their allowed image digests | AGT-2, AGT-11 | P0 | WEB-US-22 |
| WEB-21 | Log delivery and notification channels (T14) | OPS-1, OPS-3 | P1 | WEB-US-34 |
| WEB-22 | Team history (T15): activity and audit, config revisions with diff and restore (dry-run first) | CFG-3, CFG-6 | P0 | WEB-US-35 |
| WEB-23 | **Collaboration page (T16)**, route `/t/:teamId/collaboration`, per mockup T16 (root `docs/ui/30-ta-collaboration.png`): page header with *Paperclip* badge and *Info*, primary *Open Paperclip* (opens `webUiUrl` in a new tab with `rel="noopener noreferrer"`, never an iframe or embed), *Actions* menu (*Edit endpoints*, *Rotate Paperclip keys*, *Delete collaboration agent* linking to T2), the **Status** panel (agent link and *Collaboration* badge, phase and generation, hostname, registration mode, web UI and REST API state, the four conditions), the **Public endpoints** panel with the independent *Web UI* and *REST API* switches, and the *Equivalent CLI for the last change* panel. Empty state when the team has no collaboration agent. Status words follow §4.2 (extended) | COL-6, COL-8, COL-20, COL-23, PG1, PG4 | P0 | WEB-US-44 |
| WEB-24 | **Read-only collaboration (V3)**, mockup V3 (`31-tv-collaboration.png`): the same page for callers without `collaboration:manage` (viewers and collaborators), with the information banner, every switch, *Actions* item and *Connect* / *Disconnect* control disabled with "Requires team-admin", and *Open Paperclip* still working for anyone with `collaboration:access` | COL-18, COL-27 | P0 | WEB-US-51 |
| WEB-25 | **Connected agents** panel on T16: table of the team's worker agents from `ListCollaborationLinks` (agent, *Connected* switch, Paperclip agent id, link state, last sync), filter, link-state select, pagination and preferences, row selection with *Connect* and *Disconnect*, polling while any row is `pending` | COL-10, COL-12, COL-14 | P0 (manual), P1 (link states in managed mode) | WEB-US-48 |
| WEB-26 | **Managed secrets and recent access** panels on T16: *Paperclip-managed secrets* (read-only names, *Managed by* badge, last change) from `ListSecrets`, and *Recent access* (sign-ins, people, denied; top people with the *Service admin entry* marker) from the `collaboration` report | SEC-7, COL-31, COL-36 | P0 (secrets), P2 (access) | WEB-US-49 |
| WEB-27 | **T3 role step.** A *Role* step offers *Worker* (default) or *Collaboration (Paperclip)*; collaboration lists only templates with the `paperclip` capability, forces a dedicated AWS identity, defaults the snapshot schedule to daily with 14 kept and never offers *off*, defaults on-delete to snapshot then delete, and is disabled when the team already has a collaboration agent. Workers get a *Connect to Paperclip* switch | COL-1, COL-2, COL-3, COL-5, COL-10 | P0 | WEB-US-45 |
| WEB-28 | **Other team screens.** T1 / V1 *Collaboration* tile (hostname, surface states, *Open Paperclip*); T2 *Collaboration* badge on the collaboration agent and a *Paperclip* column (link state); *Collaboration* navigation item between *Agents* and *Members & access* for roles holding `collaboration:read` | COL-6, COL-14 | P0 | WEB-US-53 |
| WEB-29 | **Managed secrets on T4 / V2.** A *Managed by* column (*Managed by AFS*, *Managed by Paperclip*, plain *Team* for user secrets), a `managedBy` filter, and managed rows read-only (no edit, put-value or delete; rotate only where the contract allows) with tooltips naming who manages them. Secret values are never requested for any row | SEC-7, COL-7, SEC-1 | P0 | WEB-US-54 |
| WEB-30 | **Permission mirror and the collaborator role.** `domain/permission.ts` gains role `team_collaborator`, the five `collaboration:*` permissions and the guardrail coverage of `mayExposeCollaboration`, exactly as the contract §3 and the pinned `permissions.json` define them; the drift test passes against the new fixture; the header, team switcher and tooltips know the role; no screen offers an action the role lacks, and a collaborator session sends no mutating request from any team screen except where its permissions allow (none in the console) | ACC-2, COL-18, PC-D6 | P0 | WEB-US-55 |
| WEB-31 | **Members and API keys with the new role.** T6 role pickers (members and API keys) offer *Team collaborator* beside *Team admin* and *Team viewer*; lists show the role; viewers and collaborators see the same read-only controls and no *API keys* tab (D50) | ACC-2, ACC-4 | P0 | WEB-US-56 |
| WEB-32 | **Team guardrail.** S3 (create team) and the team administration page (S2 → `/teams/:teamId/admin`) carry the checkbox *May publish collaboration endpoints* (`mayExposeCollaboration`, on by default, service admins only); S2 gains an optional column of it; the `hostname_held` conflict is explained on S3 | COL-23, TEAM-9 | P0 | WEB-US-52 |
| WEB-33 | **S10 *Collaboration* tab** (`/settings/collaboration`): the seven `collab.*` settings with their allowed ranges and the service-level list of every team's endpoint (`ListCollaborationEndpoints`: team, hostname, web UI, REST API, state, last access) with CSV download | COL-23, COL-30, COL-36 | P0 (settings), P2 (list) | WEB-US-57 |
| WEB-34 | **S10 identity providers and agent templates.** The identity provider form takes the optional collaboration client (`collabClientId` and a Secrets Manager reference `collabClientSecretArn`, never a value); the agent templates tab shows and edits `capabilities` | COL-17, COL-2, PC-OQ-6 | P0 | WEB-US-58 |
| WEB-35 | **Collaboration report kind** (P2) in T11 and S8: a *Collaboration* report with surface, reason and person grouping, CSV download, not schedulable | COL-36 | P2 | WEB-US-59 |
| WEB-36 | **Key operations, managed mode and guidance on T16** (P1): *Rotate Paperclip keys*, the registration mode in *Edit endpoints*, the unmanaged-agents alert, the first-admin bootstrap and low-trust guidance panels | COL-7, COL-12, COL-13, COL-29, COL-32 | P1 | WEB-US-50 |

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
| Platform › Service settings › Collaboration (WEB-33) | S10 *Collaboration* tab | `/settings/collaboration` |
| Platform › Export & import | S11 | `/export-import` |
| Team › Overview | T1 (V1 for viewers) | `/t/:teamId` |
| Team › Agents | T2 list and detail panel (tabs: secrets & identity T8, external systems T10, usage T12, logs, revisions); T3 create | `/t/:teamId/agents[/:agentId]`, `/t/:teamId/agents/new` |
| Team › Collaboration (Paperclip change, WEB-28) | T16 (V3 for callers without `collaboration:manage`) | `/t/:teamId/collaboration` |
| Team › Pools & stages | P4 (ephemeral teams only) | `/t/:teamId/pools` |
| Team › Members & access | T6 *Members* tab | `/t/:teamId/members` |
| Team › API keys | T6 *API keys* tab (team-admins and service admins only, D50) | `/t/:teamId/members/api-keys` |
| Configuration › Secrets | T4 (V2 for viewers) | `/t/:teamId/secrets` |
| Configuration › Agent identities | T8, team view (every agent's identity and links, opening the agent's T8 tab) | `/t/:teamId/identities` |
| Configuration › External systems | T9 | `/t/:teamId/external-systems` |
| Configuration › Models | T1 *Models* tab (`ListTeamModels`; edit by service admins) | `/t/:teamId/models` |
| Configuration › Log delivery | T14 *Log delivery* tab | `/t/:teamId/delivery/logs` |
| Configuration › Notifications | T14 *Notifications* tab | `/t/:teamId/delivery/notifications` |
| *(not in IA)* Configuration › Configuration values | T7 (missing from the root IA, OQ-W1) | `/t/:teamId/config` |
| Cost › Budget & usage | T5 | `/t/:teamId/budget` |
| Cost › Reports | T11 (T12 per agent; *Collaboration* kind, WEB-35) | `/t/:teamId/reports` |
| Cost › Cost tags | T13 | `/t/:teamId/tags` |
| History › Activity & audit | T15 *Activity & audit* tab | `/t/:teamId/history/audit` |
| History › Config revisions | T15 *Config revisions* tab | `/t/:teamId/history/revisions` |

`T16` and `V3` are added to the console's `ScreenId` list; the route `/t/:teamId/agents/new` accepts `?role=collaboration` and the T4 route accepts `?create=1&scope=agent&agentId=&name=` (create dialog prefill, never a value).

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

The console never shows `Running`, `Healthy` or `Blocked (cap)`.

**Paperclip additions (WP-D2).** Collaboration vocabulary, all from the contract or the mockups T16 and V3, never colour alone:

| Source | Words shown | Dot |
|---|---|---|
| Surface state (`effective.webUi`, `effective.restApi`): what the edge honours | On, Off | green, hollow grey |
| Link state (`CollaborationLink.linkState`; not `status.phase`) | linked, pending, failed, disabled | green, amber, red, hollow grey |
| Condition on T16 (`EndpointReady`, `PaperclipReady`, `RegistrationHealthy`) | True, False, Unknown | green, red, amber |
| Condition `UnmanagedPaperclipAgents` (inverted) | False, True, Unknown | green, red, amber |
| `Secret.managedBy` | Managed by AFS (blue badge), Managed by Paperclip (amber badge), Team (plain) | none |
| Role in the header | Service admin (orange), Team-admin (blue), Team collaborator (teal, WP-D9), Team viewer (grey), Security operator | none |

The link state `pending` is amber and is not the blue `Pending` of `status.phase`; the console never shows `Online`, `Connected` as a state word (*Connected* is only the switch's label) or `Syncing`.

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
  create (D52), `secretKey` is `undefined` and `meta.idempotentReplayed === true`.

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
  true (plus `swarm-templates:read`, D37, and `teams:read-directory`, D56); table tests cover each role's allowed and denied case: a security operator and a service admin are allowed `teams:read-directory`, a team-admin, a viewer and a team API key are denied it.
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
- The CLI preview for create-secret shows `--secret-value file://<path>` (never the value).

### Console, service admin

**WEB-US-12 · Service dashboard (S1).** *(US-10, US-15)*
- S1 shows team and agent counts, month-to-date spend against the sum of budgets, reconciler health and
  the top 5 spenders, each linking to the team.
- *Teams needing attention* lists teams expiring within 7 days, budget pressure (≥ 80%), *Budget
  blocked*, `Degraded` agents and reverted drift in the last 24 h, each with the reason and a link.
- A warning banner appears when any team-day is over the variance threshold or price proposals are
  pending, with counts and links to S8 *Reconciliation* and S4.

**WEB-US-13 · Teams (S2).** *(US-23, US-24, TEAM-1, TEAM-7, BUD-1)*
- The table shows slug, kind, state, agent count, spend against budget, cost center and expiry
  (ephemeral only), filterable by kind and state.
- *Actions* on a selected team: *Suspend*, *Resume*, *Set ceiling*, *Raise ceiling temporarily* and
  *Delete*; delete asks to type the slug; *Set ceiling* refuses a value below the current budget with the
  API's `ValidationError`.
- *Raise ceiling temporarily* (D34) takes an amount and an expiry; the row then shows the override and
  when it ends.
- Given a team is suspended, its row shows state *Suspended*; *Delete* is for service admins only (a
  team-admin has no S2 and the API answers `403` to `DeleteTeam`); after deletion the row shows *Deleted*
  and its usage, cost and history stay readable.
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

**WEB-US-20 · Service settings (S10).** *(US-21, ACC-1, ACC-4, AGT-9, OPS-5; WEB-16)*
- *Settings* lists every key from `GetSettings` with value, default, allowed range and last change;
  *Edit* validates the range before sending `PutSetting` with `If-Match`.
- *Identity providers*: add, edit and disable Okta or Entra ID providers (issuer, client id, groups
  claim, console client id and CLI client id) and choose the default; the list shows the teams using each; *Disable* is disabled for a
  provider in use, and the API's `409` is shown if it races; any client secret is entered write-only
  (WEB-US-11) and only its ARN is shown.
- *Storage classes*: add, edit and remove the classes T3 offers and mark the default; a class in use
  cannot be removed (`409` lists the agents).
- *Agent templates*: see WEB-US-22.
- *Service API keys*: create keys with the `security_operator` role only, shown once (WEB-US-11), with
  expiry ≤ 90 days; list shows prefix, expiry and last use.
- *Security operators*: add or remove users and IdP groups.
- *Notification channels* (service level, OPS-5): add, edit and delete the service's email, Slack, webhook
  and Jira channels used for service events and, through `work_orders.notification_channel_id`, for
  outside work order contacts; deleting the channel named in that setting shows the API's `409`.
- Given a team-admin, S10 is not in the navigation and its routes show the not-found page.

**WEB-US-21 · Export and import (S11).** *(US-13, CFG-4..6; WEB-17)*
- *Create export* starts `CreateExport`, shows its progress, and lists past exports with size, checksum
  and, once complete, the download link, which is valid 7 days and then shows as expired (D49); a note says the bundle holds no secret values.
- *Import* takes a bundle and an account map (source → target account ids); *Dry run* is the default and
  shows the plan (create, update, skip per resource) from the same synchronous call that *Apply* repeats with `dryRun=false`; a bundle over 100 MB is refused client-side; *Apply* is enabled only after a dry run of
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

**WEB-US-24 · Team overview (T1).** *(US-2, US-13, US-23, TEAM-5)*
- T1 shows namespace, cluster, IAM role ARN (copyable), cost center, phase with conditions (type, status,
  reason, message, time), budget burn against amount, agent health counts and recent activity.
- The *Models* tab lists the team's enabled models; only service admins can edit it.
- A *Work orders* card lists work orders assigned to the team or touching its repositories
  (`ListTeamWorkOrders`), read-only.
- Given a suspended team, T1 shows state *Suspended*, write controls are disabled with "Team is
  suspended", and the API's `409` is shown if a write races; *Resume* stays available.
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

**WEB-US-28 · Budget and usage (T5).** *(US-9, US-24, BUD-1..5)*
- T5 shows month-to-date spend, month-end forecast with projected cap date, action at exhaustion, latest
  reconciliation, daily spend split into Bedrock tokens and EKS compute, and spend by agent.
- *Edit budget* takes amount, thresholds and (service admins only, persistent teams only) the action at
  exhaustion (D33); an amount above the ceiling is refused client-side with the ceiling named, and by the
  API with `ValidationError`.
- Given a team-admin, the ceiling, override, quotas and *notify* controls are not offered (service admins
  only); the API's `403` is shown if forced.
- A link opens T14 *Notifications*, where threshold alerts are delivered.

**WEB-US-29 · Members and API keys (T6).** *(US-2)*
- Team-admins add people (by email) or IdP groups as team-admin or team viewer; there is no
  `service_admin` choice, and a crafted request for it is refused by the API.
- *API keys* creates a key with name, role and expiry (≤ 90 days, default 30); the secret is shown once
  (WEB-US-11); the list shows prefix, role, expiry and last use.
- Given a viewer, membership controls are disabled with "Requires team-admin" and the *API keys* tab is
  not shown (D50).
- The page shows the team's sign-in provider; team-admins can change it among the enabled providers.
- Given a `CreateApiKey` retry is replayed without `secretKey` (D52), the dialog says the key was created
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

**WEB-US-34 · Log delivery and notifications (T14).** *(US-19, OPS-1, OPS-3; WEB-21)*
- *Log delivery* lists destinations (CloudWatch, S3, OTLP, Splunk HEC, Datadog) with status and last
  delivery; team-admins add, edit and delete them; credentials are chosen as secret references, never
  typed into the form.
- *Notifications* lists channels (Slack, email, webhook, Jira) with the events each receives and its
  delivery status; *Send test* sends one test message and shows the result.
- Deleting a channel used by a report schedule lists the schedules first.
- A failed delivery shows on the channel with its error.
- Viewers see both tabs read-only: create, edit and delete are disabled with "Requires team-admin", and the
  API's `403` for `CreateLogDestination` or `CreateNotificationChannel` is shown if forced.

**WEB-US-35 · History (T15).** *(US-13, US-14, US-20, CFG-2, CFG-3; WEB-22)*
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
- A security operator signs in to a console with only *Work orders* and *Swarm templates* (read-only); the list filters by status,
  severity, SLA state and team, showing team names from `ListTeamDirectory`.
- *Create work order* takes CVE, severity, SLA, template (from `ListSwarmTemplates`, enabled only), cap
  and repositories, each with an owner picker (D38): a team picked from `ListTeamDirectory` by slug or
  name, an email, or both, or no owner at all, in which case `afs-api` resolves it from the teams'
  `AFS_OWNED_REPOS` configuration (an exact entry beats a wildcard; an explicit owner always wins).
- The picker pre-fills from the resolution: when `CreateWorkOrder` answers `400` with
  `details.ambiguousRepos`, each listed repository's picker is pre-filled with the candidate teams to
  choose from, and with `details.unownedRepos` those repositories are highlighted and need an owner;
  after a successful create each repository shows whether its owner came from *team configuration* or was
  *explicit* (`ownerSource`). The CLI preview shows `--repos host/owner/repo` for a repository with no
  owner chosen and `--repos host/owner/repo=team_…,ops@example.com` for one with owners.
- A second work order for an open CVE shows the API's `409` with a link to the existing one.
- The detail shows SLA state, remediation team with spend against cap, one row per repository with
  status, PR link and notifications sent; *Cancel* asks for a reason.
- A team-admin or viewer of an owning team sees the work order read-only, with only their repositories'
  rows; opening a work order with no link to their teams shows the not-found page (API `404`).

**WEB-US-41 · Swarm templates (P5).** *(US-22, WO-2)*
- Service admins create and edit templates (stages, pools, handoffs, secrets needed, configuration, cap,
  TTL, teardown), see revisions, and enable or disable a template; a disabled template is not offered
  in *Create work order*.
- Security operators see *Swarm templates* in the navigation, read-only (D37); team roles do not see
  the page.

### Paperclip collaboration (change PRD `paperclip-team-collaboration-PRD.md`)

These stories implement the website share of the root change PRD's §7.4 (`WEB-US-43`) and §7.5 (`WEB-US-44`,
`WEB-US-45`), split finer where one story would be too large to build and review. **The SDK stories come
first and are built and released before any console story** (§10, milestone C1-SDK). The contract is the root
`docs/contracts/api-contract.md` v1.3.0 (§3, §4.4b, §4.4c, §4.6, §4.9, §6, §7); names below are theirs. Mockups T16
and V3 exist (root `docs/ui/30-ta-collaboration.png`, `31-tv-collaboration.png`); every other changed screen
has no new mockup and follows its current screen (OQ-WP2). "Proven by" names the test file and test title
the story adds; none exist yet. Vitest files sit next to their code; Playwright files are under
`apps/console/e2e/specs/collaboration/`.

| Product story | Split here into |
|---|---|
| WEB-US-43 SDK for collaboration | WEB-US-43 (resource, helper, resync), WEB-US-46 (fields on existing resources), WEB-US-47 (errors and wire fidelity) |
| WEB-US-44 Collaboration page | WEB-US-44 (T16 core), WEB-US-48 (connected agents), WEB-US-49 (managed secrets, recent access), WEB-US-50 (keys, managed mode, guidance), WEB-US-51 (V3), WEB-US-53 (T1, V1, T2 and navigation) |
| WEB-US-45 Create agent and team guardrail | WEB-US-45 (T3), WEB-US-52 (S2, S3), WEB-US-54 (T4, V2), WEB-US-56 (T6), WEB-US-57 (S10 tab), WEB-US-58 (S10 providers and templates) |
| *(not in the change PRD)* | WEB-US-55 (permission mirror), WEB-US-59 (collaboration report), WEB-US-60 (fake API), WEB-US-61 (baselines and axe) |

### SDK: collaboration

**WEB-US-43 · SDK collaboration resource.** *(refines US-27, US-30, US-31, US-33; SDK-12, SDK-14, SDK-16; milestone C1-SDK)*
As a pipeline or console author, I want typed calls for the collaboration operations, so that I never hand-write them.
- Given the contract resynced to v1.3.0 (SDK-16), when `bun run contract:check` runs, then it passes, and the
  `operationId` → method coverage test (WEB-US-1) maps exactly: `GetTeamCollaboration` → `collaboration.get()`,
  `PutTeamCollaboration` → `collaboration.put()`, `ListCollaborationLinks` → `collaboration.links.list()`,
  `ConnectAgentToCollaboration` → `collaboration.connectAgent()`, `DisconnectAgentFromCollaboration` →
  `collaboration.disconnectAgent()`, `RotateCollaborationKeys` → `collaboration.rotateKeys()` and
  `ListCollaborationEndpoints` → `admin.collaborationEndpoints.list()`. The test fails if any of the seven has no
  method or a method is not in the table.
- Given `collaboration.put(resource, {webUiEnabled: true, restApiEnabled: false})` with a resource at `version: 4`,
  then the request is `PUT /v1/teams/{teamId}/collaboration` with `If-Match: "4"`; a `412` throws `AfsError` with
  `isPreconditionFailed === true`; given only a team id, the SDK first sends `GET` and reports `appliedToVersion`.
- Given `collaboration.connectAgent(teamId, agentId, {paperclipAgentId: "ag_8f2a41"})`, then the request is
  `POST /v1/teams/{teamId}/collaboration/links/{agentId}:connect` with a generated `Idempotency-Key`, the same on every
  retry; a replayed response sets `meta.idempotentReplayed === true`. `disconnectAgent` and `rotateKeys`
  (`POST …/collaboration:rotate-keys`, body `{names?}`) behave the same way.
- Given `collaboration.links.list(teamId, {linkState: "pending"})`, then it sends `?linkState=pending`, follows
  `nextToken` one request per page, and `.pages()` yields `items` and `nextToken`.
- Given `admin.collaborationEndpoints.list({state: "Ready"})`, then `asCsv()` sends `Accept: text/csv` and returns
  every page with one header row, as for the other CSV operations.
- Given `collaboration.get()` returns `hostname: null`, `webUiUrl: null`, `restApiUrl: null` and
  `effective: {webUi: false, restApi: false, reasons: ["base_domain_unset"]}`, then the types allow `null` and
  `endpointUrl(teamId)` returns `{webUi: null, restApi: null, hostname: null}`; given
  `effective.webUi = true` and `effective.restApi = false` with URLs set, it returns `webUi` as the `webUiUrl`
  and `restApi: null`. It makes one `GET` and no other request, and no test can make it accept a Paperclip key.
- A bundle importing only `AfsClient` and `collaboration` contains no code from other resources; the collaboration
  resource is ≤ 3 KB gzip (`size-check`); every new export has TSDoc (`tsdoc-check`); the contract replay test
  replays the contract's collaboration examples (the `TeamCollaboration`, `CollaborationLink` and
  `CollaborationEndpoint` JSON of §4.4b) through the SDK without a type error.
- The new resource runs in the Chromium, Bun 1.4 and Node 22 matrix of WEB-US-4.
- Proven by: `packages/sdk/test/contract-replay.test.ts › collaboration examples`; `packages/sdk/tools/contract-sync.test.ts › pins v1.3.0 with the team_collaborator role`;
  `packages/sdk/src/generated/operation-coverage.test.ts › every operationId has a method (collaboration)`;
  `packages/sdk/src/resources/collaboration.test.ts › put sends If-Match`, `› connectAgent reuses the idempotency key`,
  `› links.list follows nextToken`, `› endpointUrl returns only effective surfaces`, `› endpointUrl never carries a paperclip key`;
  `packages/sdk/tools/size-check.ts` run in CI.

**WEB-US-46 · SDK fields on existing resources.** *(refines US-27, US-28, US-32, US-33; SDK-13)*
- `agents.create(teamId, {role: "collaboration", template, iamIdentity: "dedicated", volume: {snapshotSchedule: "daily", snapshotRetain: 14}})`
  sends `role` as given; `agents.update()` with a changed `role` is not blocked by the SDK (the API answers
  `ValidationError`) but the type of the update body has no `role` member; `agents.list(teamId, {role: "collaboration"})`
  sends `?role=collaboration`; a worker's `collaboration` object (`connect`, `paperclipAgentId`, `linkState`,
  `lastSyncedAt`, `lastError`) is typed, and the field is absent (not `null`) on the collaboration agent.
- `teams.create()` and `teams.update()` accept `mayExposeCollaboration: boolean`; `Team.mayExposeCollaboration` is typed.
- `secrets.list(teamId, {managedBy: "paperclip"})` sends `?managedBy=paperclip`; `Secret.managedBy` is the open union
  `"user" | "afs" | "paperclip"` (given `"future"`, it is returned as is); `Secret.secretsManagerArn` and `secretsManagerPath`
  are never values.
- `agentTemplates.list({capability: "paperclip"})` sends `?capability=paperclip`; `AgentTemplate.capabilities` is
  `string[]`; `admin.agentTemplates.put(name, {…, capabilities: ["paperclip"]})` sends them.
- `admin.identityProviders.create()` and `.update()` accept `collabClientId` and `collabClientSecretArn`;
  `collabClientSecretArn` without `collabClientId` is not blocked by the SDK (the API answers `ValidationError`); the
  types of `signInProviders.list()` have neither field.
- `Member.role`, `ApiKey.role` and the exported `TeamRole` accept `"team_collaborator"`; a service-level key type
  does not include it.
- `reports.team(teamId, "collaboration", {range: "7d", groupBy: ["day", "person"]})` returns typed rows with
  `signIns`, `uniquePeople`, `requests`, `deniedRequests`, `secretDetections`, `principal {id, type: "user" | "api_key", name?}`
  and `serviceAdminEntry?: true`, plus `totals` and `notes`; `reports.service("collaboration", {groupBy: ["team"]})`
  likewise; `groupBy` accepts `surface`, `reason`, `person`; `.asCsv()` returns the body byte for byte. Money stays
  decimal strings (WEB-US-5); the collaboration report has no money field.
- Proven by: `packages/sdk/src/resources/agents.test.ts › role and collaboration`, `teams.test.ts › mayExposeCollaboration`,
  `secrets.test.ts › managedBy filter and open union`, `agentTemplates.test.ts › capabilities`, `identityProviders.test.ts › collab client fields`,
  `members.test.ts › team_collaborator`, `reports.test.ts › collaboration kind`, `packages/sdk/test/contract-replay.test.ts › existing resources at 1.3.0`.

**WEB-US-47 · SDK errors and wire fidelity for the new contract.** *(refines US-32; SDK-15, SDK-10, SDK-11)*
- Given a fake response `422` with `{code: "SecretDetected", details: {patterns: ["aws_access_key"]}}`, then the
  error has `isSecretDetected === true` and every other getter `false`; the SDK exports it for callers of the
  edge, although `afs-api` never returns it.
- Given `409` with `details.reason = "collaboration_agent_exists"`, `"collaboration_agent_missing"`, `"managed_secret"`,
  `"hostname_held"` or `"team_suspended"`, then `isConflict === true`, `details.reason` is exposed unchanged, and the
  exported constant equals the string; given `400` with `details.reason = "master_key_not_rotatable"`, then
  `isValidationError === true` and `details.fields[0].reason` is available; an unknown reason string passes through.
- Given `GetTeamCollaboration` answers `404` with `details.reason = "collaboration_agent_missing"`, then `AfsError.isNotFound`
  is `true` (callers branch on the reason, PC-D19).
- With a debug hook installed, `rotateKeys()` request and response logging shows no body; the response
  (`rotated[].versionId`, `signsOutEveryone`, `agentRolloutPending`) contains no secret value, and an `AfsError` from any
  collaboration call never contains a Paperclip key, `X-Afs-Authorization` or `Authorization` (redaction test with a sentinel).
- Proven by: `packages/sdk/src/core/errors.test.ts › isSecretDetected`, `› collaboration reasons`; `packages/sdk/src/resources/collaboration.test.ts › no secret in diagnostics`.

### Console: Paperclip collaboration (T16, V3)

**WEB-US-44 · Collaboration page (T16 core).** *(refines US-27, US-28, US-30; WEB-23; mockup T16)*
As a team-admin, I want one page that shows my team's Paperclip and lets me switch its public surfaces, so that we publish only what we use.
- Route `/t/:teamId/collaboration` (screen `T16`, navigation item *Collaboration*; §4.1). The page loads
  `GetTeamCollaboration`, `ListCollaborationLinks`, `ListSecrets` and the collaboration report in parallel; each panel
  shows its own skeleton and its own error, so one failing panel never blanks the page (§7).
- **Empty state.** Given `GetTeamCollaboration` answers `404` with `details.reason = collaboration_agent_missing`, then the
  page shows "This team has no collaboration agent" with *Create collaboration agent*, which opens
  `/t/:teamId/agents/new?role=collaboration` (T3) and is disabled with "Requires team-admin" when the caller lacks
  `agents:write`. No other panel is rendered, and no request for links, secrets or report is sent.
- **Status panel.** Shows the collaboration agent as a link to `/t/:teamId/agents/:agentId` with a *Collaboration* badge;
  the phase as dot plus word (§4.2) with "gen N / M" (`generation` and `status.observedGeneration`; while `M < N` the
  panel says "Change not applied yet"); the hostname in monospace with *Copy* (`—` and the text "Not configured" when
  `hostname` is `null`); the registration mode as *Manual* or *Managed*; *Web UI* and *REST API* as dot plus word
  (§4.2: *On* green, *Off* hollow grey); and the four conditions `EndpointReady`, `PaperclipReady`,
  `RegistrationHealthy`, `UnmanagedPaperclipAgents` as the type, a dot and the literal `True`, `False` or `Unknown`.
  The dot is green when the condition is healthy (the first three `True`, `UnmanagedPaperclipAgents` `False`), red when it
  is not, amber for `Unknown`; the condition's `reason` and `message` show on focus and hover and in the *Info* panel.
- **Open Paperclip** is a link styled as the page's primary button that opens `webUiUrl` in a new tab. It is disabled
  (rendered `aria-disabled` with the reason as its tooltip and `aria-describedby`) in this order of precedence: no
  hostname → "Public collaboration is not configured for the service"; `effective.webUi` false → the text for the first
  entry of `effective.reasons[]` (below), else "The web UI is off. A team-admin can turn it on."; team `state` is
  `Suspended` → "Team is suspended"; phase not `Ready` → "The collaboration agent is <Phase>". It does not need
  `collaboration:manage`; it needs `collaboration:access` from `GetMe`, else it is disabled with "Requires team-viewer".
- **Reason texts** for `effective.reasons[]` and the matching `ValidationError` field reasons:
  `team_not_allowed` / `collaboration_not_allowed_for_team` → "Not allowed for this team by the service";
  `service_endpoints_off` / `collab_public_endpoints_off` → "Public collaboration is off for the service";
  `base_domain_unset` / `collab_base_domain_unset` → "Public collaboration is not configured for the service";
  `provider_without_collab_client` → "Your sign-in provider has no collaboration client; ask a service admin" (web UI only).
- **Switches.** *Web UI* and *REST API* are `role="switch"` controls inside the two cards of the mockup, each card
  stating what it exposes and who may use it (the mockup's text). With `can(collaboration:manage)`: toggling a
  surface **on** first opens a confirmation, "Turning this on makes <Web UI | REST API> reachable from the internet for people with an
  AFS role on this team. Every request is signed in and checked by AFS." with *Turn on* and *Cancel* (WP-D4);
  toggling **off** needs no confirmation. Either sends `PutTeamCollaboration` with both current switch values (the
  changed one flipped) and `If-Match: "<version>"` and shows "Takes effect within a minute" (the contract promises 60 s p95).
  A switch whose surface is not effective **and** whose stored choice is off is disabled with the reason text as its
  tooltip (the mockup note under the cards). A switch whose stored choice is **on** but not effective stays enabled (turning off is
  always accepted by the API) and its card shows "Your choice is On, but AFS is not serving it: <reason text>" (WP-D3);
  the state word then reads *Off*, because §4.2 shows what the edge honours.
- **Actions menu** (milestone C1): *Edit endpoints* (a dialog with the two switches, the same rules, confirmation and review step with the equivalent command; the registration-mode radio is added in C3, WEB-US-50) and *Delete collaboration agent*
  (opens the agent's T2 detail, where delete asks to type its name; nothing is deleted from T16). *Rotate Paperclip keys* is added in C3 (WEB-US-50). The whole menu is disabled with "Requires team-admin" without `collaboration:manage`.
- **Errors.** `412` shows "This changed since you opened it" with *Reload*, keeping the pending choice visible (WEB-11);
  `ValidationError` with `details.fields[]` shows the reason text beside the card (never a generic message);
  `409` `team_suspended` shows "Team is suspended"; `409` `collaboration_agent_missing` switches to the empty state;
  `403 AccessDenied` shows the access-denied alert naming `details.requiredPermission` and the request id.
- **CLI panel** *Equivalent CLI for the last change*: after a change shows `afs collaboration put-collaboration --team-id
  <id> --web-ui-enabled|--no-web-ui-enabled --rest-api-enabled|--no-rest-api-enabled`, adding `--registration-mode
  manual|managed` only when it was changed; before any change it shows the command for the current state, labelled
  "Equivalent CLI for the current settings". The team id is shown shortened to 12 characters and `…` as in the mockup, and *Copy*
  copies the complete command (WP-D16). It never contains a secret.
- **Suspended team.** Every mutating control is disabled with "Team is suspended"; *Open Paperclip* follows its precedence list.
- **Polling.** After a change `status.phase` is `Pending`; the page polls `GetTeamCollaboration` per WEB-7 (5 s for 2 min, then 30 s;
  stops on `Ready` or `Failed`; paused while the tab is hidden; honours `429 Retry-After`).
- **No Paperclip content, no Paperclip key.** The console renders no Paperclip content, calls no edge URL (CSP
  `connect-src` is unchanged, §6.2) and has no field in which a Paperclip key could be typed except the existing secret dialogs.
- Proven by: `apps/console/src/domain/collaboration.test.ts › open-paperclip precedence`, `› reason texts`, `› state words`;
  `apps/console/src/application/usecases/collaboration/CollaborationUseCases.test.ts › put sends both switches with If-Match`,
  `› empty state on collaboration_agent_missing`; `apps/console/src/presentation/screens/t16-collaboration/CollaborationPage.test.tsx › status panel`,
  `› switch confirm on enable`, `› blocked switch tooltips`, `› on but not effective can be turned off`, `› 412 keeps the choice`,
  `› team suspended disables controls`, `› cli panel`; `e2e/specs/collaboration/collaboration.spec.ts › team-admin turns the REST API on and off`,
  `› open paperclip is disabled with its reason`, `› empty state`, `› polls until Ready`.

**WEB-US-48 · Connected agents.** *(refines US-28; WEB-25)*
As a team-admin, I want to connect agents to Paperclip and see each link, so that agents pull work on their first start.
- The panel lists one row per live worker agent from `ListCollaborationLinks` (the collaboration agent and pools are not
  listed by the API): agent name (link to T2), *Connected* switch, Paperclip agent id (monospace, `—` when empty), link
  state and last sync. Link states are dot plus word (§4.2 extended): `linked` green, `pending` amber, `failed` red,
  `disabled` hollow grey. *Last sync* is relative ("3 min ago") with the UTC time on hover; a `failed` row shows
  `lastError` as text on hover and focus (rendered as text, never HTML). The heading shows the count, "Connected agents (6)".
- A text filter (agent name, client-side) and a link-state select (*All link states*, `pending`, `linked`, `failed`,
  `disabled`, sent as `?linkState=`), pagination with `maxResults`/`nextToken`, and preferences as for other tables.
- The *Connected* switch on a row sends `ConnectAgentToCollaboration` or `DisconnectAgentFromCollaboration` for that agent,
  disabled while the request is in flight and when the caller lacks `collaboration:manage` ("Requires team-admin") or the
  team is suspended. The notice under the heading reads "Connected agents get PAPERCLIP_API_URL, PAPERCLIP_AGENT_ID and
  PAPERCLIP_AGENT_API_KEY in their environment. Agents that predate the collaboration agent are not connected automatically."
- **Bulk.** Selecting rows enables *Connect* when at least one selected row has `connect = false` and *Disconnect* when at
  least one has `connect = true`. *Connect* opens a dialog listing exactly the qualifying selected agents (the dialog is the
  confirmation) and warning "Each agent restarts"; it then sends one `ConnectAgentToCollaboration` per agent, one after
  another, each with its own `Idempotency-Key`, and shows each agent's result (success, or the API message and request id);
  a failure does not stop the others and nothing is rolled back (WP-D5). *Disconnect* is the same with `DisconnectAgentFromCollaboration`.
- In `manual` registration the Connect dialog shows an optional *Paperclip agent id* input per agent (sent as `paperclipAgentId`)
  and the guidance "Store each agent's Paperclip key as a secret named paperclip-agent-api-key on that agent" with a link per agent to T4
  with the create dialog prefilled (`?create=1&scope=agent&agentId=<id>&name=paperclip-agent-api-key`; no value is ever prefilled).
  In `managed` registration the input is not shown and the dialog says "AFS registers the agent in Paperclip and stores its key".
  A `ValidationError` `reason: managed_registration` on the id is shown if forced.
- The dialog's side panel shows one equivalent `afs collaboration connect-agent --team-id <id> --agent-id <id> [--paperclip-agent-id <id>]`
  per agent (or `disconnect-agent`).
- While any row is `pending` the panel polls `ListCollaborationLinks` (one request per interval for the whole table, WEB-7);
  it stops when none is `pending` and while the tab is hidden.
- Empty state: "No worker agents yet" with a link to T3. A `409 collaboration_agent_missing` on any action switches the page to its empty state.
- No request is sent for an agent that is a pool or the collaboration agent (they are not in the list; a crafted attempt is the API's `ValidationError`).
- Proven by: `…/t16-collaboration/ConnectedAgentsPanel.test.tsx › rows and link state words`, `› failed row shows lastError`, `› bulk connect sends one call per agent`,
  `› one failure does not stop the rest`, `› manual dialog has agent id inputs`, `› managed dialog has none`, `› polls while pending`, `› disabled without collaboration:manage`;
  `e2e/specs/collaboration/links.spec.ts › connect two agents`, `› disconnect`, `› pending becomes linked without a reload`.

**WEB-US-49 · Paperclip-managed secrets and recent access.** *(refines US-32; WEB-26)*
- **Managed secrets panel.** Lists secrets of the collaboration agent whose `managedBy` is `afs` or `paperclip`: the page
  sends `ListSecrets?managedBy=paperclip` and `ListSecrets?managedBy=afs` (up to 100 each) and keeps only items whose
  `agentId` is the collaboration agent's (WP-D7); the heading shows the total, "Paperclip-managed secrets (3)". Columns: name
  (monospace), *Managed by* badge (*Managed by Paperclip* amber, *Managed by AFS* blue), last changed (date, UTC on hover). No value column, no
  actions; a link *Manage on Secrets* opens T4 filtered to the agent. When either call has a `nextToken`, the panel says "More on Secrets" with the link.
  The text reads "Created by Paperclip itself under the agent's reserved path. Read-only; values are never shown." Nothing in the panel ever requests a value (WEB-8).
- **Recent access panel.** Calls `reports.team(teamId, "collaboration", {range: "7d", groupBy: ["day", "person"]})`; needs `reports:read` (viewers have it), else the
  panel is not rendered. Three tiles: *Sign-ins* = `totals.signIns`, *People* = `totals.uniquePeople`, *Denied* = `totals.deniedRequests`. Below, a table of
  people aggregated by the console from the day rows (sum of `signIns`, `requests`, `deniedRequests`; one request, no extra calls), sorted by
  requests descending, top 10, with "View all in Reports" linking to T11 with the collaboration report. The person is `principal.name`, else `principal.id`;
  an API key shows "<name> (API key)". A person with any row carrying `serviceAdminEntry` gets the badge *Service admin entry*. Caption: "Last 7 days, from the edge's
  records. Counts only, no content." Empty: "No access in the last 7 days." No person name goes to telemetry (§7).
- Proven by: `…/t16-collaboration/ManagedSecretsPanel.test.tsx › keeps only the collaboration agent's afs and paperclip secrets`, `› no value requested`;
  `…/RecentAccessPanel.test.tsx › aggregates day rows per person`, `› service admin entry badge`, `› api key label`, `› hidden without reports:read`;
  `apps/console/src/application/usecases/collaboration/CollaborationUseCases.test.ts › recent access aggregation`;
  `e2e/specs/collaboration/panels.spec.ts › the managed secrets and recent access match the fixture`, `› no secret value in any request` (sentinel scan, WEB-US-11).

**WEB-US-50 · Keys, managed mode and guidance on T16.** *(refines US-27, US-28, US-32; WEB-36; priority P1, milestone C3)*
- **Actions menu**: *Rotate Paperclip keys* is added to the menu of WEB-US-44; *Delete collaboration agent* needs `agents:write` in addition to `collaboration:manage`.
- **Edit endpoints** dialog gains *Registration mode* (radio *Manual*, *Managed*) beside the two switches; *Managed* is disabled with "The collaboration agent must be Ready" unless phase is
  `Ready` (the API's `collaboration_agent_not_ready` is shown if forced); the review step shows the equivalent command.
- **Rotate Paperclip keys** dialog: lists `paperclip-better-auth-secret` and `paperclip-tool-action-signing-secret` (checked by default) and
  `paperclip-secrets-master-key` (unchecked, disabled, "Cannot be rotated: Paperclip could no longer decrypt its stored identities"); the warning "Rotating signs everyone out of Paperclip and restarts the collaboration agent"; a required acknowledgement checkbox. It sends
  `RotateCollaborationKeys` with `{names}` and an `Idempotency-Key`. The result lists each rotated name with "restart pending" (`agentRolloutPending`) and shows no value
  (there is none). `master_key_not_rotatable` from the API is shown if forced. Equivalent CLI: `afs collaboration rotate-collaboration-keys --team-id <id> [--names …]`.
- **Unmanaged agents.** When `unmanagedPaperclipAgents` is non-empty or condition `UnmanagedPaperclipAgents` is `True`, an alert says "Paperclip has agents AFS does not manage: <names>.
  Each Paperclip agent must be an AFS agent with its own pod, or be removed in Paperclip." Names are rendered as text.
- **Sign-up and registration conditions.** `PaperclipReady=False` with reason `OpenSignUp` shows "Paperclip sign-up is open. Close it in Paperclip's settings."; `RegistrationHealthy=False` shows the condition's message.
- **Guidance** in *Info*: (a) how access works (an AFS role decides on every request; viewers read, collaborators and team-admins write; people may also be asked to sign in to Paperclip, PC-OQ-1); (b) in `manual` mode, how to register agents (create the agent in
  Paperclip, record its id with *Connect*, store its key as `paperclip-agent-api-key`) and the first-admin bootstrap (COL-32): "The first Paperclip admin invite is written to the collaboration agent's log" with *Open agent logs* linking to the agent's logs tab on T2;
  in `managed` mode "AFS sends the first admin invite through your team's notification channels"; (c) Paperclip's `low_trust_review` trust preset is recommended for projects that ingest external content such as synced Jira and GitHub items and untrusted pull requests (COL-29); AFS does not set it.
- Proven by: `…/t16-collaboration/RotateKeysDialog.test.tsx › master key is disabled`, `› requires acknowledgement`, `› sends the chosen names`, `› no value shown`;
  `…/EditEndpointsDialog.test.tsx › managed disabled until Ready`; `…/CollaborationPage.test.tsx › unmanaged agents alert`, `› open sign-up alert`, `› info panel guidance by mode`;
  `e2e/specs/collaboration/keys.spec.ts › rotate signs everyone out notice`, `› edit endpoints to managed`.

**WEB-US-51 · Read-only collaboration (V3).** *(refines US-27, US-30; WEB-24; mockup V3)*
As a viewer or collaborator, I want to see how our Paperclip is set up and open it, so that I understand what I may do.
- Given a caller without `collaboration:manage` (viewer, collaborator) and with `collaboration:read`, the page is the V3 variant: an information
  banner at the top, "You have read-only access to this page. You can open Paperclip and see how it is set up. Team-admins (<names>) change the endpoints and connections. Your role
  decides what you can do inside Paperclip: viewers read, collaborators also write."; `<names>` are up to 3 emails of user bindings (and group names) with role `team_admin` from `ListMembers`, then "and N more"; when
  `ListMembers` fails or has no team-admin, the parenthesis is omitted (WP-D14). The banner is a labelled region, not an alert.
- Every switch, *Actions* (the whole menu), *Connect*, *Disconnect* and each row's *Connected* switch is visible and disabled with the tooltip "Requires team-admin"; the *Actions* tooltip is shown on focus as well as hover.
  *Open Paperclip* works for anyone with `collaboration:access` (every team role) under the precedence of WEB-US-44.
- All panels render as for team-admins (status, endpoints, connected agents, managed secrets, recent access) from the same calls; the CLI panel reads "Equivalent CLI for the current settings".
- The e2e viewer and collaborator sessions send no mutating request from `/t/:teamId/collaboration` (extends the M6-Q3 check, `viewer-readonly.spec.ts`, by this route and the `collaborator` user); a crafted
  `PutTeamCollaboration` returns `403 AccessDenied` and the console shows the access-denied alert naming `collaboration:manage`.
- Given a team with no collaboration agent, a viewer sees the empty state with *Create collaboration agent* disabled ("Requires team-admin").
- Proven by: `…/t16-collaboration/CollaborationPage.test.tsx › viewer variant disables every control`, `› banner names team-admins`, `› banner without members`, `› collaborator sees the same variant`;
  `e2e/specs/collaboration/readonly.spec.ts › viewer and collaborator send no mutating request`, `› open paperclip works for a viewer`, `› crafted put is denied`; visual `31-tv-collaboration`.

### Console: other screens

**WEB-US-45 · Create agent with a role (T3).** *(refines US-27, US-28; WEB-27)*
As a team-admin, I want to create the team's collaboration agent from T3, so that the team gets a Paperclip in one flow.
- A *Role* step is the first step of T3 for agents (not for pools): *Worker* (default) or *Collaboration (Paperclip)*. The step loads `ListAgents?role=collaboration&maxResults=1`
  (WP-D13): when an item exists, *Collaboration (Paperclip)* is disabled with "This team already has a collaboration agent" and a link to it; a racing `409` with `details.reason = collaboration_agent_exists` shows the same text on the step.
  `?role=collaboration` in the URL preselects it (from the T16 empty state).
- **Collaboration role.** Template choices come from `ListAgentTemplates?capability=paperclip` (enabled templates and their allowed digests only; given none, the step says "No Paperclip template is enabled. Ask a service admin."
  and *Next* stays disabled). *AWS identity* is fixed to *Dedicated* and disabled with "Collaboration agents always have their own AWS identity". *Snapshot schedule* defaults to *Daily*, *Keep* to 14, and offers no *Off* option; *On delete* defaults to *Snapshot, then delete*.
  The section says "Paperclip's data lives on this agent's volume. AFS generates and stores Paperclip's boot secrets; you never see them." The `collaboration` field is not sent. The create request carries `role: "collaboration"`, `iamIdentity: "dedicated"`, `volume.snapshotSchedule: "daily"`, `volume.snapshotRetain: 14`, `volume.onDelete: "snapshot_then_delete"` unless changed.
- **Worker role.** Templates exclude those whose `capabilities` contain `paperclip` (a `paperclip` template is refused for a worker by the API). A *Connect to Paperclip* switch is shown, on by default when the team has a collaboration agent, off and disabled with "This team has no collaboration agent" otherwise;
  it is sent as `collaboration.connect`. Pools do not show it. The secret-binding list offers only `managedBy = user` secrets (`afs` and `paperclip` secrets cannot be bound by the user).
- **Result.** `503 Unavailable` (boot secrets could not be written; nothing was created) shows the API message and keeps the form. After a successful collaboration create the console opens T16, which shows the new agent `Pending` and polls to `Ready`
  (US-27: ready within 5 minutes p95, a property of the platform, shown not enforced). A `ValidationError` on `template`, `iamIdentity` or `volume.snapshotSchedule` highlights the named field.
- The CLI side panel updates with the role: `afs agents create-agent --team-id <id> --name <name> --role collaboration --template <name> --iam-identity dedicated …`; for workers `--collaboration-connect` or `--no-collaboration-connect`. The review step shows both the settings and the command.
- A *Collaboration* badge and the *Paperclip* column appear on T2 after creation (WEB-US-53).
- Proven by: `…/t3-create-agent/CreateAgentPage.test.tsx › role step`, `› collaboration disabled when one exists`, `› only paperclip templates`, `› dedicated identity forced`, `› snapshot off not offered`, `› worker excludes paperclip templates`,
  `› connect switch default`, `› 409 collaboration_agent_exists`, `› 503 keeps the form`, `› cli for collaboration role`; `…/application/usecases/agents-create/CreateAgentUseCases.test.ts › collaboration defaults`;
  `e2e/specs/createAgent/createCollaboration.spec.ts › create the collaboration agent and land on T16`, `› second create is refused`; visual `08a-create-agent-collaboration`.

**WEB-US-52 · Team guardrail on S2 and S3.** *(refines US-33; WEB-32)*
- S3 (create team), in the step that holds the other guardrails, has the checkbox *May publish collaboration endpoints*, checked by default, with the help "Lets this team switch on public access to its Paperclip. Turning it off stops both public surfaces without losing the team's choices."; the review step shows it and
  the CLI command includes `--may-expose-collaboration` or `--no-may-expose-collaboration`. Only service admins reach S3 (WEB-US-13).
- The team administration page (`/teams/:teamId/admin`, S2 detail) shows the same checkbox, editable only with `teams:set-guardrails` (service admins); saving sends `UpdateTeam` with `If-Match` and `{mayExposeCollaboration}`; a `412` follows WEB-11. S2's table has an optional column *May publish collaboration* (hidden by default, in preferences; filterable).
- Given a service admin turns it off for a team with a live endpoint, the page says "Both public surfaces stop within a minute. The team's choices are kept." and T16 for that team then shows the switches disabled with "Not allowed for this team by the service".
- Given `CreateTeam` answers `409` with `details.reason = hostname_held`, S3 shows on the slug field "A team with this name had a collaboration endpoint that was deleted recently. Its hostname is held for 30 days. Choose another name." (the contract names the reason but not the operation, OQ-WP1).
- Team-admins and viewers never see S2 or S3 (the not-found page, as today).
- Proven by: `…/s3-create-team/CreateTeamPage.test.tsx › guardrail checkbox default on`, `› cli includes the flag`, `› hostname_held on the slug`; `…/s2-teams/TeamAdminPage.test.tsx › set guardrails only for service admin`, `› 412 reload`;
  `e2e/specs/teams/collaborationGuardrail.spec.ts › turning it off disables the switches on T16`; baselines `03-admin-create-team` re-approved.

**WEB-US-53 · Team overview tile, agents list and navigation.** *(refines US-27, US-28; WEB-28)*
- **Navigation.** *Collaboration* appears in the *Team* group between *Agents* and *Members & access* (route `/t/:teamId/collaboration`, screen `T16`), shown when `can(collaboration:read)` for the team; the navigation-to-route test (WEB-18) covers it. Security operators never see it. A viewer sees it (V3).
- **T1 / V1 tile.** A *Collaboration* card shows the hostname (monospace), *Web UI* and *REST API* as dot plus word, the agent phase, and *Open Paperclip* (same enablement and reasons as T16). It calls `GetTeamCollaboration`; `404 collaboration_agent_missing` shows "No collaboration agent" with a link to T16 (viewers) or *Create collaboration agent* (team-admins); a failing call shows the card's own error. The card is absent for callers without `collaboration:read`.
- **T2.** The collaboration agent row has a *Collaboration* badge and `—` in the *Paperclip* column; a worker's *Paperclip* column shows its link state (dot plus word; a worker with `connect = false` shows *Not connected*); `ListAgents` is called as today (the `collaboration` field arrives with each agent). Deleting the collaboration agent asks to type its name and adds the text "This disables Paperclip's public endpoints, removes the route and disconnects every agent" (COL-8).
- **Filtering.** T2 gains a *Role* filter (`?role=`).
- Given a `GetMe` with no `collaboration:*` permission (an API older than contract v1.3.0), the item and the tile are absent, `/t/:teamId/collaboration` shows the not-found page, and no collaboration operation is called.
- Proven by: `apps/console/src/domain/navigation.test.ts › collaboration item`, `› no item without collaboration:read`, `routes.test.ts › T16 route`; `…/t1-overview/TeamOverviewPage.test.tsx › collaboration tile`, `› tile empty state`, `› tile hidden without collaboration:read`;
  `…/t2-agents/AgentsPage.test.tsx › collaboration badge and paperclip column`, `› delete warns about disconnecting`; `e2e/specs/overview/overview.spec.ts › collaboration tile` ; baselines `06-team-overview`, `12-viewer-overview`, `07-team-agents` re-approved.

**WEB-US-54 · Managed secrets on T4 and V2.** *(refines US-32; WEB-29)*
- The table has a *Managed by* column: `afs` → badge *Managed by AFS*, `paperclip` → badge *Managed by Paperclip*, `user` → plain "Team". A *Managed by* filter (`user`, `afs`, `paperclip`) sends `?managedBy=`.
- Given an `afs` or `paperclip` row, *Edit*, *Put value* and *Delete* are disabled with "Managed by AFS" / "Managed by Paperclip"; if a request is forced the `409` with `details.reason = managed_secret` is shown as "This secret is managed by <AFS | Paperclip> and cannot be changed here".
- *Rotate*: for an `afs` row it is enabled and opens a dialog without a value field ("AFS generates the new value. Agents that use it restart.", WP-D15), sending `RotateSecret` with no value; for `paperclip-secrets-master-key` it is
  disabled with "Cannot be rotated: Paperclip could no longer decrypt its stored identities" (`master_key_not_rotatable` shown if forced); for a `paperclip` row it is disabled with "Managed by Paperclip". The value column reads "Write-only" for every row; nothing requests a value.
- A `paperclip` secret has *Bound to* "Not bindable" and its managed path is shown; the secret-binding pickers (T3 and agent edit) never list `afs` or `paperclip` secrets.
- *Create secret* refuses, client-side with the API's reason text and again by the API (`ValidationError`, `reason: reserved_name`), the name `paperclip` and any name starting `paperclip-`, except `paperclip-agent-api-key` with scope *Agent* on a worker agent; the dialog's CLI preview and the sentinel rules of WEB-US-11 are unchanged.
- V2 (viewer, collaborator) shows the same column and filter read-only.
- Proven by: `…/t4-secrets/SecretsPage.test.tsx › managed by column and filter`, `› managed rows are read-only with tooltips`, `› rotate afs row has no value field`, `› master key rotate disabled`, `› no value ever requested`;
  `…/SecretDialogs.test.tsx › reserved names`; `e2e/specs/secrets/managed.spec.ts › afs and paperclip rows`, `› sentinel scan still clean`; baselines `09-team-secrets`, `13-viewer-secrets` re-approved.

**WEB-US-55 · Permission mirror and the team collaborator role.** *(refines US-27, US-29; WEB-30; ACC-2, PC-D6)*
- `domain/permission.ts` gains `team_collaborator` in `Role` and in the catalog: every grant of `team_viewer` is also granted to `team_collaborator` with the same condition (`viewerKubectl`, `assignedOrOwnRepos`; OQ-WP1); plus
  `collaboration:read` (viewer, collaborator, team-admin, service admin), `collaboration:manage` (team-admin, service admin), `collaboration:access` (viewer, collaborator, team-admin, service admin), `collaboration:contribute`
  and `collaboration:api` (collaborator, team-admin, service admin). `teams:set-guardrails` stays service admin. Security operators and workload principals get none of them.
- The drift test compares the catalog (every permission and its roles, including `team_collaborator`) with the pinned `permissions.json` and fails on any difference, in both directions (a permission present only on one side fails).
- `can()` still reads `GetMe.teams[teamId].permissions[]`; given a collaborator `Me` it is `true` for `collaboration:contribute` and `collaboration:api` and `false` for `collaboration:manage`, `members:write`, `agents:write`, `secrets:write` and `api-keys:read`; table tests cover every role's allowed and denied case for each of the five new permissions.
- The "Requires <role>" tooltip text is derived from the catalog (lowest unconditional team role): `collaboration:manage` → "Requires team-admin"; `collaboration:contribute` → "Requires team-collaborator"; `collaboration:access` and `collaboration:read` → "Requires team-viewer".
- The header shows the role and team: *Team collaborator · payments-factory* in teal (WP-D9; the existing orange, blue and grey are unchanged; contrast ≥ 4.5:1 on the header, checked by the axe run); the team switcher is unchanged.
- A collaborator session has no *API keys* tab and no *Members* write control, exactly as a viewer (WEB-US-29, D50); the M6-Q3 check runs for `collaborator` as well as `viewer` over every team screen and finds no enabled change control and no mutating request.
- Proven by: `apps/console/src/domain/permission.test.ts › collaborator grants`, `› drift against permissions.json`, `› collaboration permissions by role`, `› tooltip role names`; `…/domain/permissionDenied.test.ts › collaborator denied cases`;
  `e2e/specs/quality/viewer-readonly.spec.ts › M6-Q3 collaborator`; `e2e/specs/shell/shell.spec.ts › header shows team collaborator`.

**WEB-US-56 · Members and API keys with the collaborator role (T6).** *(refines US-27; WEB-31; ACC-2)*
- The *Add member* dialog's role select offers *Team admin*, *Team collaborator*, *Team viewer* (no `service_admin`, no `security_operator`); the *API keys* create dialog offers the same three. The CLI preview shows `--role team_collaborator`.
- The member list and key list show the role word *Team collaborator*; changing a role to or from it sends `UpdateMember` with `If-Match` as today.
- The help under the picker says "Collaborators can write in the team's Paperclip and use its REST API; they cannot change AFS settings." A viewer or collaborator sees every control disabled with "Requires team-admin" and no *API keys* tab.
- A crafted request for `service_admin` or `security_operator` is refused by the API and shown (WEB-US-29, unchanged).
- Proven by: `…/t6-members/MembersPage.test.tsx › collaborator in the role picker`, `› cli role flag`; `…/ApiKeysTab.test.tsx › collaborator key role`; `e2e/specs/members/members.spec.ts › add a team collaborator`; baseline `11-team-members` re-approved.

**WEB-US-57 · S10 Collaboration tab.** *(refines US-33; WEB-33; COL-23, COL-30)*
- Route `/settings/collaboration` (service admins only, as every S10 tab; hidden from team roles). It lists the seven settings of the Paperclip PRD §6.9 from `GetSettings` with value, default and allowed range: `collab.base_domain` (text; unset reads `null`, shown "Not set — public collaboration is off"), `collab.public_endpoints`
  (switch), `collab.allowed_source_cidrs` (list of CIDRs, one per line, IPv4 or IPv6; empty means any), `collab.session_ttl_minutes` (15 to 1440), `collab.content_scan` (select `block`, `warn`, `off`), `collab.max_body_mb` (1 to 100), `collab.denied_spike_threshold` (1 to 100000).
  Each is saved with `PutSetting` (`{value}`); out-of-range values are refused client-side with the range and by the API's `ValidationError`.
- Changing `collab.base_domain` (set, change or unset) or switching `collab.public_endpoints` off opens a confirmation naming the effect ("Every team's Paperclip address changes" / "Every team's public endpoint stops within a minute; teams' choices are kept"); `collab.content_scan = off` confirms "Credentials typed into Paperclip will no longer be blocked or detected".
  Turning `collab.allowed_source_cidrs` into a non-empty list warns "Requests from outside these ranges are blocked by the firewall".
- The *Settings* (general) tab no longer lists `collab.*` keys (WP-D12). The service-level **endpoint list** (P2, milestone C4) calls `ListCollaborationEndpoints` and shows team (link to T16 via the team switcher semantics for service admins), hostname, web UI and REST API (dot plus word from `effective`), team state, phase, *May publish* and last access
  (relative, UTC on hover) with filters `teamId` and `state` (`Ready`, `Degraded`, `Failed`, `Pending`), pagination, preferences and *Download CSV*. Team-admins, viewers and collaborators get the not-found page for the route.
- A `403` from either call shows the access-denied alert naming `admin:settings`.
- Proven by: `…/s10-settings/tabs/collaboration/CollaborationTab.test.tsx › seven settings and ranges`, `› confirmations`, `› cidr list parsing`, `› endpoint list and csv`, `› hidden for team roles`;
  `…/SettingsTab.test.tsx › collab keys are not listed on General`; `e2e/specs/settings/collaboration.spec.ts › set the base domain`, `› endpoints list`; baseline `10c-admin-settings-collaboration` new.

**WEB-US-58 · S10 identity providers and agent templates.** *(refines US-33; WEB-34; COL-17, COL-2)*
- The identity provider create and edit form has an optional section *Collaboration sign-in*: `Collaboration client id` and `Collaboration client secret reference` (a Secrets Manager ARN, validated client-side as starting `arn:aws:secretsmanager:` with the API authoritative; never a secret value, WP-D18). The reference needs the client id (client-side and `ValidationError`); help text: "Used by the collaboration endpoint. One redirect URI per environment: https://<collab base domain>/oauth2/callback." (the base domain from the `collab.base_domain` setting, or the placeholder "<collab base domain>" when unset).
  The list shows a *Collaboration* column (*Configured* or *Not configured*). `ListSignInProviders` data never includes these fields and the sign-in picker is unchanged.
- The agent templates tab shows a *Capabilities* column and an editable multi-select (`paperclip`) in the create and edit dialogs, sent as `capabilities`; the help says "Only templates with the paperclip capability can be used for a collaboration agent, and they cannot be used for workers."
  `ListAgentTemplates?capability=` is used by T3 (WEB-US-45), not here.
- Both stay service-admin only; the existing identity-provider and template behaviour (disabling one in use → `409`) is unchanged.
- Proven by: `…/s10-settings/tabs/identity-providers/IdentityProvidersTab.test.tsx › collaboration client fields`, `› reference needs client id`, `› never lists collab fields on sign-in providers`;
  `…/agent-templates/AgentTemplatesTab.test.tsx › capabilities column and edit`; `e2e/specs/settings/settings.spec.ts › collaboration client on a provider`, `e2e/specs/adminCatalogs/adminCatalogs.spec.ts › paperclip capability`; baselines `10b-admin-identity-providers`, `23-settings-agent-templates` re-approved.

**WEB-US-59 · Collaboration report (P2).** *(refines US-33; WEB-35; COL-36)*
- T11 (team reports) and S8 (service reports) offer a *Collaboration* report kind: team-level `reports.team(teamId, "collaboration", …)`; service-level `reports.service("collaboration", {groupBy: ["team"]})`. Measures: sign-ins, unique people, requests, denied requests, secret detections;
  grouping by day, surface (*Web UI*, *REST API*), reason (*Unauthenticated*, *Forbidden*, *Surface disabled*, *Secret detected*, and the non-denied *Bad request*, *Throttled*) and person; `serviceAdminEntry` rows carry the *Service admin entry* badge; CSV download (`asCsv()`); the usual range and filters.
- **Not schedulable:** the *Schedule* action is absent for this kind (PC-D13; `report` in a schedule stays `usage|costs|activity|traffic`). Usage only: no column can hold Paperclip content.
- The T16 *Recent access* panel's *View all in Reports* link opens this report with `range=7d&groupBy=person`.
- Proven by: `…/t11-reports/ReportsPage.test.tsx › collaboration kind and groupings`, `› no schedule action`; `…/s8-reports/ReportsPage.test.tsx › collaboration service report`; `e2e/specs/reports/reports.spec.ts › collaboration report and csv`.

### Console: test infrastructure and quality for the change

**WEB-US-60 · Fake AFS API additions for e2e.** *(refines US-27..US-33; the fake API must serve contract v1.3.0)*
- The fake AFS API (`apps/console/e2e/fake-afs`) serves the pinned v1.3.0 contract: its `Contract` loads the resynced `openapi.yaml`, and the "every operation has a fixture" and "fixtures validate against the OpenAPI" tests (`fake-afs.test.ts`) stay green with the seven new operations.
- New fixture module `fixtures/collaboration.ts` (registered in `fixtures/index.ts`, with `resetCollaboration` called by the server reset) implements: `GetTeamCollaboration`, `PutTeamCollaboration` (validates like the contract: `If-Match` optional, `412` on mismatch, `ValidationError` with `details.fields[]` reasons `collab_base_domain_unset`, `collab_public_endpoints_off`, `collaboration_not_allowed_for_team`,
  `provider_without_collab_client`, `collaboration_agent_not_ready`; always accepts switching off; `409 team_suspended`), `ListCollaborationLinks` (`linkState`, `connect` filters and paging), `ConnectAgentToCollaboration` (idempotent, `paperclipAgentId` refused with `managed_registration` in managed mode; state moves `pending` → `linked` after the next two reads or a control call),
  `DisconnectAgentFromCollaboration` (`disabled`), `RotateCollaborationKeys` (`master_key_not_rotatable` for the master key; returns `signsOutEveryone` and `agentRolloutPending`) and `ListCollaborationEndpoints` (CSV capable).
- **Seed.** The first team (`payments-factory`, `TEAMS[0]`) has the collaboration agent `paperclip-hub` (phase `Ready`, generation 6, observed 6), hostname `payments-factory.collab.example.com`, web UI on, REST API off, `manual`, the four conditions as in mockup T16, six worker agents with the mockup's links (`reviewer-bot` linked `ag_8f2a41`, `ledger-maintainer` linked `ag_3c77d0`,
  `dependency-updater` connected and `pending`, `release-notes-bot` `failed` `ag_91be05` with `lastError` "Paperclip rejected the key (401)", `test-gap-finder` and `incident-scribe` `disabled`), three secrets (`paperclip-github-connector` and `paperclip-jira-sync-token` `managedBy: paperclip`, `paperclip-better-auth-secret` `managedBy: afs`), and a collaboration report whose totals are 64 sign-ins, 11 people, 3 denied with the three people of the mockup (`dana.ortiz`, `marcus.chen`, `priya.raman` with `serviceAdminEntry`).
  A second team has no collaboration agent (empty state, `404 collaboration_agent_missing`; `CreateAgent` role `collaboration` succeeds there and creates the three boot secrets with `managedBy: afs`, the `TeamCollaboration` with web UI on and REST API off, phase `Pending` → `Ready` by polling); on the first team a second collaboration create answers `409 collaboration_agent_exists`.
- **Principals.** A seeded user `collaborator` ("Cory Collaborator", `collaborator@example.test`, token `at.collaborator.N`) with role `team_collaborator` on the first team; `GetMe` returns, per role, the `permissions[]` of contract §3 (viewer: `collaboration:read`, `:access`; collaborator: those plus `:contribute`, `:api`; team-admin and service admin: all five). The `viewer` and `team-admin` users gain the collaboration permissions the same way.
- **Control hooks** (a separate channel, `helpers/control.ts` and `server.ts`): `control.collab({baseDomain: string | null, publicEndpoints: boolean, mayExpose: boolean, providerHasCollabClient: boolean, phase: string, registrationMode: "manual" | "managed", teamState: "active" | "suspended"})` changes the state so the blocked-switch, suspended, not-ready and managed cases can be driven; `effective.reasons[]` is computed from them as the contract defines.
  Templates gain `capabilities` (one `paperclip-hub` template with `paperclip`); `ListSecrets` honours `managedBy`; `ListAgents` honours `role`; `GetSettings` includes the seven `collab.*` keys; the identity provider fixtures carry `collabClientId` and `collabClientSecretArn` on one provider; the collaboration report fixture honours `range`, `groupBy` and the service-level call.
  Collaboration state resets with `control.reset()`.
- The fake API holds no Paperclip content and no Paperclip key; a request recorder test shows none is ever sent or returned.
- Proven by: `e2e/fake-afs/fake-afs.test.ts › collaboration operations`, `› put validation reasons`, `› connect moves pending to linked`, `› rotate refuses the master key`, `› collaborator me`, `› every operation has a fixture at 1.3.0`; `e2e/fake-afs/fixtures/collaboration.test.ts › seed matches the mockup`, `› second team is empty`.

**WEB-US-61 · Visual baselines and accessibility for the change.** *(refines US-27..US-33; WEB-10, WEB-US-42)*
- **New baselines** (Playwright at 1440 × 900, scale 2, 0.5% pixel threshold, fixtures of WEB-US-60), each approved side by side with its mockup by the web lead, and J signs off T16 and V3 once (§8): `30-ta-collaboration` (team-admin, matches T16), `31-tv-collaboration` (viewer, matches V3), `30a-ta-collaboration-empty` (second team),
  `30b-ta-collaboration-blocked` (`mayExpose` off: switches disabled with the tooltip text visible), `08a-create-agent-collaboration` (T3 with the role set to *Collaboration*), `10c-admin-settings-collaboration` (S10 tab). T3 role step, T1 tile, S10 tab and T6 picker have no new mockup (OQ-WP2); the approver checks them against the existing screens' patterns.
- **Re-baselined by the navigation change.** The new *Collaboration* item changes the left navigation of every team-scoped screen, so every team-scoped baseline is regenerated in one reviewed change with a per-screenshot diff report: `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13`, `15a`, `15b`, `16`, `17`, `20`, `21`, `23-team-reports`, `24`, `25-team-notifications`, `26`, `27-ta-log-delivery`, `27-ta-swarm-pools`; also changed by their own stories: `03`, `10b`, `23-settings-agent-templates`. A re-baseline whose diff is more than the navigation item and the named change fails review.
  The root mockups for those screens predate the item; the root owner updates them or accepts the nav difference (OQ-WP2).
- **Axe** (`expectAxeClean`, WCAG 2.2 AA, no serious or critical issues): T16 as team-admin, viewer and collaborator; T16 empty and blocked states; each dialog open (switch confirmation, Edit endpoints, Rotate Paperclip keys, Connect, Disconnect); T3 with the collaboration role; T1 and V1 with the tile; T4 with managed rows; T6 role picker; S10 *Collaboration* tab and its confirmations; the identity provider form with the collaboration section;
  the collaboration report. The routes are added to `e2e/specs/quality/routes.ts` so `axe-all.spec.ts` and `keyboard.spec.ts` cover them: every T16 flow (switch, dialog, bulk connect, rotate) completes by keyboard only; switches expose name, state and the reason via `aria-describedby`; the banner is a labelled region; status changes (phase, link state) are announced through the live region (WEB-US-9).
- **Sentinel and CSP.** `secrets-sentinel.spec.ts` gains a pass over T16 and T4 managed rows (no secret value, key or Paperclip text in state, storage, DOM or telemetry); `csp.spec.ts` asserts T16 loads without a CSP violation and sends no request to the collaboration host.
- **Architecture.** `architecture.test.ts` stays green and unchanged in rules: `presentation` calls collaboration use cases from context, `domain/collaboration.ts` and the use cases import neither React nor `@afs/sdk`, and only `main/` imports the SDK adapter `infrastructure/sdk/collaboration.ts`.
- **Docs.** When the change lands, the regenerated screenshots (`docs:screenshots`) include T16 and V3, and `README.md`, `docs/product-summary.md` and `docs/product-details.md` counts (operations, screens, roles) are updated in the same change (§11).
- Proven by: `e2e/specs/collaboration/*.spec.ts › axe`, `› keyboard`; `e2e/specs/quality/axe-all.spec.ts` and `keyboard.spec.ts` with the new routes; `e2e/specs/quality/secrets-sentinel.spec.ts › t16`; `e2e/specs/quality/csp.spec.ts › t16`; `apps/console/src/architecture.test.ts` (unchanged, green).

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

**Collaboration (Paperclip change).** `domain/collaboration.ts` holds the pure rules (effective-reason texts, the *Open Paperclip* precedence, surface and link state words, the managed-secret filter, the per-person aggregation of report rows);
`application/ports/collaboration.ts` the port; `application/usecases/collaboration/` the use cases (load page data, put switches, connect, disconnect, rotate keys, recent access); `infrastructure/sdk/collaboration.ts` the adapter over `@afs/sdk`
(`collaboration.*`, `secrets.list({managedBy})`, `reports.team(…, "collaboration", …)`); `presentation/screens/t16-collaboration/` the page and its panels, lazy-loaded as its own route chunk. The rules of the dependency table above are unchanged.

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
  `X-Request-Id`, `Idempotent-Replayed`, `Retry-After`, `X-Afs-Contract-Version` and `X-Afs-Next-Token` (dependency, §9).
- **Paperclip change:** the CSP, CORS settings and `deploy/` files are unchanged. The console never fetches from a team's collaboration hostname, so its host is not added to `connect-src`; *Open Paperclip* is a top-level navigation in a new tab
  (`target="_blank" rel="noopener noreferrer"`). The edge sets its own frame-ancestors policy, so the console cannot embed it (and does not try). `deploy/build-output.test.ts` keeps asserting the headers policy has no new origin.

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
| Performance (Paperclip change) | T16 sends its calls in parallel and renders each panel when its call returns; route change < 300 ms with cached data; T16 is a lazy route chunk ≤ 40 KB gzip and the initial route bundle stays ≤ 300 KB gzip; polling on T16 is one `GetTeamCollaboration` and one `ListCollaborationLinks` per interval (never one per row), only while something is `Pending`/`Reconciling`/`pending` |
| Reliability (Paperclip change) | A failing T16 panel shows its own error and *Retry*; the other panels stay usable; an edge outage or an off surface never affects the console (it makes no call to the edge); a bulk connect continues past a failed agent and reports each result; `429` pauses T16 polling per `Retry-After` |
| Security and privacy (Paperclip change) | No Paperclip key, boot secret, secret value or Paperclip content in state, query cache, URLs, storage, logs or telemetry (WEB-8 sentinel scan covers T16 and T4); `lastError` and `unmanagedPaperclipAgents` names are rendered as text only; the console never decides access (the API and the edge do; `can()` is UX); telemetry uses the route template `/t/:teamId/collaboration` and never a hostname, team slug or person name; the confirmation before a surface goes public is mandatory |
| Compatibility (Paperclip change) | A console and SDK at contract v1.3.0 against an older `afs-api` shows no collaboration UI (no `collaboration:*` permission in `GetMe`) and keeps working (WEB-US-53); an unknown `managedBy`, `linkState`, `effective.reasons[]` or `details.reason` value renders as its raw string, never throws (SDK-10); a newer contract version shows the existing reload notice (D47) |
| Accessibility (Paperclip change) | Switches are `role="switch"` with name, state and the blocking reason via `aria-describedby`; disabled controls keep their tooltip reachable by keyboard focus; dialogs trap focus and return it; state changes (phase, link state) are announced through the live region; the teal role colour meets 4.5:1 |

## 8. Testing approach

- **Unit and component:** Vitest; use-case tests with in-memory fake ports; SDK tests with a fake `fetch`.
- **Contract:** the SDK coverage test (WEB-US-1) and the permission drift test (WEB-US-8) run against the
  pinned `-restapi` tag; the contract's OpenAPI examples are replayed through the SDK.
- **End to end:** Playwright against the dev environment for the Given/When/Then criteria, including the
  sentinel secret test (WEB-US-11) and token storage checks (WEB-US-7).
- **Visual:** Playwright snapshots per screen (WEB-US-42). **Owner: the web lead**, who approves each
  first baseline against the mockup and every re-baseline; J signs off the S-, T-, V- and P-series once.
- **Paperclip change.** The contract resync is checked by `bun run contract:check`; the fake AFS API serves v1.3.0 and is validated against it (WEB-US-60); T16, V3 and the changed steps have e2e, visual and axe checks (WEB-US-61);
  the permission drift test covers the collaborator role (WEB-US-55). No test talks to a real edge or a real Paperclip; the end-to-end check of signing in to a team's Paperclip is the `-restapi` edge's, and this repository adds one `@dev` smoke
  (`e2e/specs/collaboration/dev.spec.ts › open paperclip opens the team hostname in a new tab`) that runs only against a dev environment that has `collab.base_domain` set and asserts the link target and `rel`, nothing in the opened page.

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
| M1–M6 | A contract tag holding each milestone's operations before the console work starts (M1 teams, members, settings, identity providers; M2 agents, secrets, config, external systems, storage classes, agent templates (needs the `-db` `agent_templates` table, D54); M3 budget, usage, reports, notifications; M4 audit, tags, accounts, role links, exports, log delivery; M5 pools, kubeconfig, cost tag status; M6 work orders, swarm templates, `ListTeamDirectory`, service keys) | `-restapi` |
| C1-SDK | A `-restapi` release tag carrying API contract v1.3.0 (`openapi.yaml` with the seven collaboration operations and the new fields, `operations.json`, and the permission catalog fixture `permissions.json` with `team_collaborator` and the five `collaboration:*` permissions), tagged before this repository's resync (SDK-16). Needs `-db` 000020 only transitively | `-restapi` |
| C1 | `ListCollaborationLinks` available at C1 although the contract lists it P1 (OQ-WP5); `ListAgents?role=`, `ListSecrets?managedBy=` and `ListAgentTemplates?capability=` filters | `-restapi` |
| C1 | CLI command and flag names for the WEB-6 previews: `collaboration put-collaboration`, `connect-agent`, `disconnect-agent`, `rotate-collaboration-keys`; `agents create-agent --role`, `--collaboration-connect`/`--no-collaboration-connect`; `teams create-team --may-expose-collaboration`; `secrets list-secrets --managed-by` (CLI-US-24; exact boolean-flag spellings OQ-WP7) | `-cli` |
| C2 | Mockups for the changed screens without one (T3 role step, T1 tile, S10 *Collaboration* tab, T6 picker) or acceptance that they follow existing patterns; refreshed navigation in the existing mockups (OQ-WP2) | root |
| C2 | Dev environment with a seeded `team_collaborator` user and `collab.base_domain` set, for the `@dev` smoke only | platform |
| C3 | `managed` registration in `afs-reconciler` (link states `linked`/`failed` set by it; conditions `RegistrationHealthy`, `UnmanagedPaperclipAgents`, `PaperclipReady`) for the real-environment check of WEB-US-48 and WEB-US-50; the console builds against the fake API without it | `-restapi` |
| C4 | `ListCollaborationEndpoints` and the `collaboration` report kind with service-level `groupBy=team` | `-restapi` |
| C1–C4 | Contract changes after v1.3.0 (for example a field the review of an operation adds) arrive as a new tag and a repeat of SDK-16 | `-restapi` |

## 10. Delivery

Milestones match the root §9.

| Root milestone | This repository |
|---|---|
| M0 Foundations | SDK-1..6, SDK-9..11 pipeline; console shell, WEB-2 sign-in, WEB-3, WEB-4 (`GetMe`, catalog, drift test), WEB-5 shell and search, WEB-18 routes; hosting (§6.2) |
| M1 Teams & access | S1–S3, T1, T6, V1; S10 *Settings* and *Identity providers*; T15 audit and revisions (restore in M4); WEB-6, WEB-7, WEB-11; SDK-7 |
| M2 Agents & secrets | T2–T4, T7, T9, T10, S7, V2; S10 *Storage classes* and *Agent templates* (WEB-20); WEB-8 |
| M3 Spend control | T5, S4, S8, T11, T12; T14 notifications; WEB-9 (without scheduling); SDK-8 |
| M4 Production readiness | S5, S6, S9, T8, T13; T14 log delivery; S11 export and import (WEB-17); report scheduling (RPT-8); T15 restore; agent identities (AGT-5); S10 *Notification channels* (service level, OPS-5) |
| M5 Budgeted workloads and swarms | P2, P4 (WEB-12); isolation tier (WEB-14); viewer kubectl (WEB-15); cost tag status (WEB-19, TAG-7) |
| M6 CVE remediation | P3, P5, P6 (WEB-13); security operator role; S10 *Service API keys* and *Security operators*; feature complete |

### 10.1 Paperclip change milestones (C1 to C4 of the change PRD §10)

**The SDK is implemented, tested and released before any console story starts, in the same repository** (C1-SDK first, WG5). Each milestone's exit includes `bun run gate` green, the fake API serving the contract it needs, and the baselines named in WEB-US-61 approved by the web lead.

| Milestone | Scope in this repository | Exit criteria |
|---|---|---|
| **C1-SDK** Contract and SDK | SDK-12..SDK-16 and WEB-US-43, WEB-US-46, WEB-US-47 (all operations, all P0..P2: they are generated together); WEB-US-55 domain part (`permission.ts`, drift test, tooltip names, header role colour, `ScreenId` T16 and V3, no screen yet); WEB-US-60 fake API and seeded `collaborator` | Resync to the v1.3.0 tag done (`contract:check` green, coverage test covers the seven operations); SDK size and TSDoc checks green; Chromium, Bun and Node matrix green; `@afs/sdk` released as a minor version; permission drift green; fake API tests green |
| **C1** Collaboration agent | Console: WEB-US-45 (T3), WEB-US-44 (T16 core, including the switches, which the API refuses while `collab.base_domain` is unset), WEB-US-48 (manual registration), WEB-US-49 (managed secrets panel), WEB-US-53, WEB-US-54, WEB-US-56; V3's read-only logic is built with T16 | In the dev fake: a team-admin creates the collaboration agent on T3, lands on T16 and watches it reach `Ready`; connects two agents and sees `pending` become `linked`; secrets show *Managed by*; a collaborator and a viewer see read-only controls; baselines `30`, `30a`, `08a` and the navigation re-baseline approved; axe green on the changed screens |
| **C2** Public web UI | WEB-US-51 (V3 e2e and baseline `31`), WEB-US-52 (S2, S3 guardrail), WEB-US-57 settings part (the seven `collab.*` settings and confirmations), WEB-US-58 (IdP collaboration client, template capabilities), the `@dev` smoke; baselines `30b`, `10c`, `03`, `10b`, `23-settings-agent-templates` | A service admin sets the base domain and a team's guardrail on S10 and S3; the team-admin's switches follow the effective reasons; *Open Paperclip* opens the team hostname in a new tab in dev; denied and blocked states have tooltips; J signs off T16 and V3 |
| **C3** REST API and managed mode | WEB-US-50 (edit endpoints with registration mode, rotate keys, guidance, unmanaged-agents alert); WEB-US-48 managed-mode parts (no id inputs, link states from the reconciler); the REST API switch's confirmation copy reviewed against the live edge | A team-admin rotates Paperclip keys and switches to managed registration in dev; unmanaged agents and open sign-up alerts show; sentinel and CSP checks green |
| **C4** People and reports | WEB-US-57 endpoint list, WEB-US-59 (collaboration report in T11 and S8); `docs:screenshots` refreshed with T16 and V3; `README.md` and `docs/` counts updated | The service-level endpoint list and collaboration reports work in dev; the security review of the change signs off (M4 exit of the change PRD) |

COL-9 (swarm templates may include a collaboration agent), COL-33 (member sync) and COL-36's edge writes have no console work beyond what is listed (OQ-WP8).

## 11. Definition of done (every change)

- [ ] SDK regenerated from the pinned contract when it changed; public surface documented
- [ ] Dependency rule holds (`architecture.test.ts` green)
- [ ] Controls gated by `can(...)` from `GetMe`, and `AccessDenied` from the API handled
- [ ] No secret value in state, URL, storage, logs or telemetry; no token in `localStorage`
- [ ] Accessible; visual snapshot approved against the mockup; equivalent CLI shown on create forms
- [ ] Status shown with the §4.2 vocabulary only
- [ ] `bun run gate` green; stories' acceptance criteria covered
- [ ] (Paperclip change) The contract pin is the tag the story needs (SDK-16) and `contract:check` is green; the permission drift test is green; screens that offer a collaboration control are gated by `can('collaboration:…')` and handle `AccessDenied`
- [ ] (Paperclip change) No Paperclip key, boot secret or Paperclip content in state, URL, storage, logs or telemetry (sentinel scan); no iframe or call to a team hostname; *Open Paperclip* uses `rel="noopener noreferrer"`
- [ ] (Paperclip change) Every blocked collaboration control states its reason; a surface can only be turned on through the confirmation; new baselines approved against the mockups and every team-scoped baseline re-approved when the navigation changed
- [ ] (Paperclip change) `README.md`, `docs/product-summary.md`, `docs/product-details.md` and `docs/technical-details.md` counts and role lists updated in the same change; `docs:screenshots` refreshed when T16 or V3 changed

## 12. Open questions and decisions

### 12.1 Open questions

| # | Question | Owner | Needed by |
|---|---|---|---|
| OQ-W1 | Mockups for S10, S11, T14 and T15; add *Configuration values* (T7) to the root IA and its navigation table | root (J) | M1 |
| OQ-W2 | Should `ListSignInProviders` accept `?teamId=` and return that team's provider, so a `?teamId=` deep link picks the right provider before sign-in (it would reveal which provider a team id uses)? | `-restapi` / J | M1 |
| OQ-W3 | Resolved: the next page's token travels in the response header `X-Afs-Next-Token` (absent on the last page), so `asCsv()` fetches every page and keeps one header row (D39, API contract §1) | `-restapi` | M3 |
| OQ-W4 | Telemetry backend for Web Vitals and errors (CloudWatch RUM or the OpenTelemetry collector) | platform | M1 |
| OQ-W5 | Idle sign-out default: 60 min proposed; confirm against the enterprise session policy | J | M0 |
| OQ-W6 | Revisit push status (SSE) instead of polling if reconcile lag or rate limits make polling costly | web lead | after M3 |
| OQ-W7 | Whether the web and CLI share golden CLI-command fixtures for WEB-6 | `-cli` / web lead | M1 |
| OQ-9 | IdP-to-IAM federation for viewer kubectl (shapes the *Download kubeconfig* instructions) | J | M5 |
| OQ-WP1 | Which operation returns `409 Conflict` with `details.reason = hostname_held` (API contract §6 lists the reason, §4.4b and §4.1 do not name the operation)? Built to `CreateTeam` | `-restapi` | C2 |
| OQ-WP2 | Mockups for the T3 role step, T1 tile, S10 *Collaboration* tab and T6 picker do not exist, and the existing mockups (for example 06, 07, 08, 09) predate the *Collaboration* navigation item. Built to the existing patterns; the web lead approves the baselines, J signs off T16 and V3 | root (J) | C1 |
| OQ-WP3 | Does `team_collaborator` hold the viewer's conditional grants (`teams:get-kubeconfig` when `viewerKubectl`, `work-orders:read` for assigned or own repositories) with the same conditions? Built as yes (contract §3: "every Viewer permission") | `-restapi` | C1-SDK |
| OQ-WP4 | Does `RotateSecret` on an `afs`-managed secret take a body? Built to none, AFS generates the value (contract §4.6 does not say) | `-restapi` | C1 |
| OQ-WP5 | `ListCollaborationLinks` is P1 in contract §4.4b but T16's connections are C1 in the change PRD. Built to need it at C1 | `-restapi` | C1 |
| OQ-WP6 | The V3 banner names team-admins; `Member` carries `email` and `groupName` but no display name. Built to emails | `-restapi` / J | C2 |
| OQ-WP7 | Exact CLI spellings for the previews: boolean flag pairs (`--web-ui-enabled` / `--no-web-ui-enabled`), `--registration-mode`, `--names`, `--managed-by`, `--may-expose-collaboration` (CLI-US-24 names the commands, the flags follow the `-cli` kebab rules). Shared golden fixtures (OQ-W7) would settle it | `-cli` | C1 |
| OQ-WP8 | COL-9 lets a swarm template include a collaboration agent; the P5 screen and pools never show a role. Built to no change (pools are workers; the collaboration agent is created through T3 only) | J | C4 |
| OQ-WP9 | `ListCollaborationEndpoints` is P2 in the contract while the S10 tab is C2 in the change PRD. Built to settings at C2 and the list at C4 | J | C2 |

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
| D50 | *API keys* tab only for team-admins and service admins | WEB-US-29 |
| D52 | A replayed `CreateApiKey` never returns the key again | WEB-US-6, WEB-US-29 |
| W-1 | Polling 5 s for 2 min, then 30 s; stop on `Ready`/`Failed` or hidden page; `waitFor` uses the same cadence | WEB-7, SDK-7 |
| W-2 | `GetMe` refetched at sign-in, on focus after 5 min and after any `AccessDenied` | WEB-US-8 |
| W-3 | Visual snapshots approved against mockups by the web lead; 0.5% pixel threshold | §8 |

### 12.3 Decisions for the Paperclip change (Claude, for J's review)

Each was decided during the `review-prd` pass of 2026-11-22 (§13) and can be changed by J; the story or requirement that depends on it is named.

| # | Question | Decision | Where |
|---|---|---|---|
| WP-D1 | Where does this PRD live? | The full PRD is the archived spec file; the root `-PRD.md` stays the stub the other repositories link to. The Paperclip change is added to the archived file because it is the only full copy; `create-spec` for this change moves it into the new spec directory, and the stub then points there | header, stub |
| WP-D2 | Words and dots for the new states | §4.2 extended: surface On/Off, link state linked/pending/failed/disabled (pending is amber and distinct from the blue `Pending` phase), conditions True/False/Unknown with the inverted rule for `UnmanagedPaperclipAgents`, managed-by badges | §4.2, WEB-US-44, WEB-US-48 |
| WP-D3 | A surface whose stored choice is on but not effective | The state word follows the edge (*Off*); the card says why; the switch stays enabled so it can be turned off (always accepted by the API); a stored-off blocked switch is disabled with the reason | WEB-US-44 |
| WP-D4 | Turning a public surface on | Always asks for confirmation; turning off does not. Public exposure is the point of the change's risk model | WEB-US-44, WG3 |
| WP-D5 | Bulk connect | The selection sends one call per agent, sequentially, with per-agent results and no rollback, an explicit exception to the no-client-side-workflows non-goal because the mockup selects many rows and the API has no bulk operation | WEB-US-48, §2 |
| WP-D6 | Where the connected-agents table gets its data | `ListCollaborationLinks`, the purpose-built operation with `linkState` filter and paging, not `ListAgents`; OQ-WP5 tracks its priority | WEB-US-48 |
| WP-D7 | Which secrets the T16 panel shows | `afs` and `paperclip` secrets whose `agentId` is the collaboration agent (so a worker's `paperclip-agent-api-key` never appears), from two filtered `ListSecrets` calls | WEB-US-49 |
| WP-D8 | Recent access | One report call grouped by day and person; the console aggregates per person; person names are shown on the page (they are AFS data) and kept out of telemetry | WEB-US-49, §7 |
| WP-D9 | Header colour for *Team collaborator* | Teal, distinct from orange, blue and grey, contrast ≥ 4.5:1, checked by axe | §4.2, WEB-US-55 |
| WP-D10 | `SecretDetected` in the SDK | The getter `isSecretDetected` exists to complete SDK-5's per-code set although `afs-api` never returns the code | SDK-15 |
| WP-D11 | Shape of `endpointUrl` | `collaboration.endpointUrl(teamId)` returns `{webUi, restApi, hostname}`, each `null` unless effective; one `GET`; no Paperclip credential handling | SDK-14 |
| WP-D12 | Where `collab.*` settings are edited | Only on the new S10 *Collaboration* tab; the General tab hides them so there is one place and the confirmations always apply | WEB-US-57 |
| WP-D13 | How T3 learns the team has a collaboration agent | `ListAgents?role=collaboration&maxResults=1`, which also gives the worker's connect default; a racing `409` shows the same text | WEB-US-45 |
| WP-D14 | Naming team-admins on V3 | Emails of user bindings (and group names), at most three, from `ListMembers`; omitted if unavailable | WEB-US-51, OQ-WP6 |
| WP-D15 | Rotating an `afs` secret from T4 | No value field; AFS generates it; the master key is disabled with the reason | WEB-US-54, OQ-WP4 |
| WP-D16 | Team id in the CLI panel | Shown shortened as in the mockup; *Copy* copies the whole command | WEB-US-44 |
| WP-D17 | Opening Paperclip | A new tab with `rel="noopener noreferrer"`; never embedded; no call from the console to the edge, so the CSP is unchanged | §6.2, WEB-US-44 |
| WP-D18 | Collaboration client secret on the IdP form | Takes a Secrets Manager ARN only, validated by prefix client-side and by the API; never a value | WEB-US-58 |
| WP-D19 | Collaboration report | A report kind in T11 and S8 on demand only, no schedule action (PC-D13) | WEB-US-59 |
| WP-D20 | Test principal | A seeded fake user `collaborator`; the fake API computes `effective.reasons[]` from control hooks so every blocked case is testable | WEB-US-60 |
| WP-D21 | When the S10 endpoint list ships | Settings in C2, the endpoint list in C4 with its P2 operation | §10.1, OQ-WP9 |

## 13. Review record (Paperclip change)

`review-prd` pass of 2026-11-22 (dev-flow `commands/review-prd.md`, run by hand; the author acted as the user for step 5 and decided the open details, logged as WP-D1..WP-D21 in §12.3). Scope of the review: the additions for the Paperclip change (§1.1, SDK-12..16, WEB-23..36, §4 additions, WEB-US-43..61, §6 to §12 additions). Verdict after fixes: **Ready for spec**.

| Dimension | Status | Note |
|---|---|---|
| Problem clarity | ✅ Pass | §1.1 names the problem (no way for team-admins, collaborators, viewers and service admins to use or govern Paperclip, and no SDK calls) and the affected users |
| Scope definition | ✅ Pass | Goals WG1..WG5 with measures; non-goals extended in §2 (no embedding, no Paperclip key field, no role change, one named exception for bulk connect) |
| Functional completeness | ✅ Pass | SDK-12..16 and WEB-23..36 cover every row of the change PRD §5 "changes to existing screens", §6.8 items for this repository and the stories WEB-US-43..45, split into WEB-US-43..61; each requirement lists its stories |
| NFR coverage | ✅ Pass | Performance, reliability, security and privacy, compatibility with an older API, accessibility, bundle budget, observability (route templates only) |
| Acceptance criteria | ✅ Pass | Given/When/Then with exact names, texts, error codes, reasons, timings and "Proven by" test names per story |
| Dependency identification | ✅ Pass | `-restapi` v1.3.0 tag and permission fixture, `-cli` flag names, root mockups, platform dev environment, reconciler managed mode, per milestone |
| Open questions | ✅ Pass | OQ-WP1..9, each with owner, milestone and the default built to; 21 decisions recorded |

First scoring found these, all fixed in this pass:

- **Scope (Warn):** the change had no goals of its own and no non-goals for the console. Added §1.1 and the §2 non-goals.
- **Functional completeness (Warn):** the change PRD's WEB-US-45 did not cover the identity provider's collaboration client (COL-17) or template `capabilities` (COL-2), without which no team could use the web UI or create a collaboration agent from the console; added WEB-34 and WEB-US-58. The `hostname_held` conflict, the `managed_secret` and `reserved_name` reasons and the master-key rotation refusal were in the contract but in no story; added to WEB-US-52, WEB-US-54 and WEB-US-47. The `collaboration` report kind had no console home; added WEB-35 and WEB-US-59 (P2).
- **Functional completeness (Warn):** the *Collaboration* navigation item changes every team-scoped screen, which no story owned; added the re-baseline rule to WEB-US-61 and the compatibility behaviour for an older API to WEB-US-53.
- **Acceptance criteria (Warn):** the T16 *Actions* menu was assigned to the P1 story although *Edit endpoints* is P0; moved the menu and the switches into WEB-US-44 and left registration mode and key rotation in WEB-US-50 (C3). Blocked-switch behaviour when the stored choice is on but not effective was unspecified; added WP-D3. Bulk connect conflicted with the existing non-goal; made it an explicit exception (WP-D5).
- **Dependency identification (Warn):** the contract resync (the pin is still v1.1.0) and the `-cli` flag names were implied; added SDK-16 and the §9 rows.
- **Open questions (Warn):** contract gaps found while writing were unflagged; recorded as OQ-WP1..9 with defaults.

Strengths: stories carry exact UI text, precedence rules and test names; the SDK-first order is explicit in §10.1; every blocked control has a stated reason; secret and Paperclip content handling is a requirement, an NFR and a test.

Next step: `/create-spec` for this change (the spec directory takes this file, WP-D1), then implement SDK first (C1-SDK).
