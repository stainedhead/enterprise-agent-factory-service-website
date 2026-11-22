# Implementation notes: `-website` feature complete

| | |
|---|---|
| **Feature** | website-feature-complete |
| **Date** | 2026-11-21 |

Purpose: the decisions, edge cases and deviations behind the implementation. Update this file whenever a
task makes or changes a decision, finds an edge case, or deviates from plan.md or tasks.md. Decisions are
numbered `WD-n` and never renumbered; a reversed decision is marked *Superseded by WD-m*. Step 4 turns the
architectural ones into ADRs (`docs/architectural-decision-record.md`, ADR-005 onward).

## 1. Technical decisions (made at spec time, 2026-11-21; J authorized deciding without questions)

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| WD-1 | Work on `feat/website-feature-complete` off `main` `420ecaf`; the clone needed `git fetch origin main:refs/remotes/origin/main` because its fetch refspec omitted `main` | Procedure; a plain fetch left `main` behind | — |
| WD-2 | Pin the contract as a byte snapshot in `packages/sdk/contract/` (`openapi.yaml`, `permissions.json`, `operations.json`) with `contract.lock.json` (source, ref, commit, sha256 each); `contract:check` first in the gate; `contract:update --ref` is the only way to change it | Reproducible generation while `-restapi` has no tag; the checksum catches hand edits | Git submodule (forbidden pattern in this product set); fetching at build time (non-reproducible, network in CI) |
| WD-3 | Own code generator (`packages/sdk/tools/codegen`, Bun + `yaml`), emitting TypeScript text | TS 7 native compiler may break generators that use the TS JS API; we need open enums, branded `Money`, `readonly` server fields, `XInput` types and the `x-afs-*` extensions | `openapi-typescript`, `orval`, `@hey-api/openapi-ts` |
| WD-4 | Generate the resource modules too (42 modules from `x-afs-sdk`), each a factory over the core; `createAfs()` facade for `afs.teams.list()`; hand-written extras only in `src/resources/` (`waitFor`, reports) | The method table is the contract (SDK-1); generating it makes drift impossible; factories keep tree-shaking (WEB-US-4.4) | Hand-written resource clients (182 methods to keep in step by hand) |
| WD-5 | Signature rule: positional path params, then body, then options; the last path param of an `If-Match` operation also takes a `Versioned` resource | Matches PRD examples (`teams.update(team, {displayName})`, `agents.list(teamId)`) | Single options object (less ergonomic, breaks PRD examples) |
| WD-6 | Read-before-write readers derived mechanically: same-path `GET`, else the parent collection's list filtered by id/name/key (`host`+`repo` for work order repos); a test requires one for each of the 43 `If-Match` operations | 23 of 43 have no `GET` (research.md §3) | Refusing id-only writes for those (breaks D40) |
| WD-7 | `PUT`: `If-Match` when a version is held; id-only `PUT` with a reader reads first (absent → no header); schema without `version` → `If-Match: "1"` (CQ-2 interim, `ApiKey` only) | Correct under both the `IfMatchPut` description and CD-2 (F-3); keeps T6 delete working until `-restapi` adds `version` (F-2) | Never sending `If-Match` on `PUT` (fails if the description is what the server enforces) |
| WD-8 | `CONTRACT_VERSION` = the snapshot's `info.version` (1.1.0 now); a newer `X-Afs-Contract-Version` triggers the hook once per client | The OpenAPI is the generation source; the contract text's v1.2.0 is not what the server will send until `-restapi` bumps `info.version` (OQ-W9) | Hard-coding 1.2.0 (would flag every current server response as older) |
| WD-9 | Libraries: TanStack Query v5, React Router, `oauth4webapi`, `web-vitals`; tests: Testing Library + happy-dom, axe-core, Playwright + `@axe-core/playwright`, Vitest browser mode; no chart library, no CSS-in-JS | PRD names TanStack Query; `oauth4webapi` has no storage of its own (tokens stay in memory); SVG charts keep the 300 KB budget and the CSP | `oidc-client-ts` (defaults to Web Storage), Recharts/ECharts (size), TanStack Router (React Router is more familiar to contributors) |
| WD-10 | Gated e2e runs on a fake AFS API and fake OIDC IdP (Bun) whose fixtures are validated against the pinned OpenAPI; the PRD's dev-environment run is the opt-in `e2e:dev` project, never in the gate | No test may call a real API; dev env and seeded users are a platform dependency (CQ-7) | Mock Service Worker in the browser (would hide CORS and header behaviour) |
| WD-11 | Visual snapshots at 1440 × 900 with device scale factor 2 (mockups are 2880 × 1800), `maxDiffPixelRatio` 0.005; first baselines committed with `pending` approval in `e2e/visual/approvals.json`, plus a side-by-side HTML report artifact for the web lead (W-3) | Implementers cannot approve against the mockup; CI must still catch drift | Blocking CI until approval (would stall every milestone) |
| WD-12 | S10, S11, T14 and T15 follow the S2 table pattern; their baselines stay `pending` until mockups exist (OQ-W1) | PRD §9 | — |
| WD-13 | T7 is in the navigation as *Configuration › Configuration values* at `/t/:teamId/config` | PRD §4.1 lists the route; WEB-18 needs a nav item per route; root IA update requested (CQ-5) | Route without nav item (fails WEB-18) |
| WD-14 | `?teamId=` deep links use the remembered or default provider; no `?teamId=` on `ListSignInProviders` | Not in the OpenAPI (OQ-W2); avoids revealing a team's provider | — |
| WD-15 | Telemetry is a backend-neutral JSON beacon to `telemetryUrl` (data-dictionary §6) | OQ-W4 open; CloudWatch RUM or an OTLP collector can both take it behind a small adapter | Adopting a vendor SDK now |
| WD-16 | Idle sign-out default 60 min, `idleTimeoutMinutes` 5–720 in `config.json` | OQ-W5; confirm against enterprise policy | — |
| WD-17 | CLI previews come from a table emitted from `x-afs-cli` and the operations' field names (kebab-case), golden-tested here | OQ-W7: shared fixtures with `-cli` can come later; the same source keeps both aligned | Hand-written command strings |
| WD-18 | Styles are CSS modules and design tokens only; no runtime style injection | CSP `default-src 'self'` without `unsafe-inline` | CSS-in-JS (needs `style-src 'unsafe-inline'` or nonces) |
| WD-19 | The repo ships hosting artefacts (`apps/console/deploy/`: headers policy, cache behaviours, config schema) and a build-output test; the CloudFront/S3 Terraform lives with the platform. `AGENTS.md`'s "use `VITE_*` config" line is replaced (D43) | D43 one build for all environments | Per-environment builds |
| WD-20 | `domain/me.ts` models `Me` as the OpenAPI does; `Principal`/`bindings` in `permission.ts` are removed in M0 | PRD §6.1 | Adapting the old model |
| WD-21 | A page polls with one query (the list, or the detail), its interval computed over every shown phase | WEB-US-9.4 and rate limits | Per-row status queries |
| WD-22 | Console money arithmetic uses scaled `bigint` (6 fraction digits) on `Money` strings | Never `number` (SDK-10, BUD-1) | `Number`/`parseFloat` |
| WD-23 | SDK size measured by a Vite library build per entry and gzip, in the gate | WEB-US-4.4 | Size of `tsc` output (not what consumers bundle) |
| WD-24 | TSDoc check reads emitted `.d.ts` text, not the TS compiler API | TS 7 (no JS API guarantee) | typedoc / api-extractor |
| WD-25 | SDK runtime matrix: Vitest on Node 22, `bun --bun vitest`, Vitest browser mode on Chromium (Playwright provider) | WEB-US-4.3, one suite | Separate per-runtime suites |
| WD-26 | Security operators: header *Security operator*, navigation only *Work orders* and *Swarm templates*, landing `/work-orders`; they never call team-scoped routes | WEB-3, contract §2 (`403` on team routes) | — |
| WD-27 | CD-1..CD-10 adopted as the OpenAPI has them: `202` delete → resource, `204` → `void` (CD-1); `PUT` `If-Match` per WD-7 (CD-2); `NotificationTestResult` 200/202 (CD-3); `RestoreResult` (CD-4); `Snapshot`, `StorageClass`, `AuditEvent`, `Revision`, `CostRow` (CD-5); `requestMetadataDroppedKeys` in T13 (CD-6); no client effect (CD-7, CD-8); identity provider form shows both client ids (CD-9); a caller with no team and no service role gets a "No access yet" page and the console never calls `ListTeams` for them (CD-10) | The OpenAPI decides details (contract §1 header rule) | — |
| WD-28 | *Download kubeconfig* shows the YAML download and the CLI command; federation instructions are one replaceable component | OQ-9 open | — |
| WD-29 | Agent panel *Logs* tab shows the team's log destinations and the CLI command; no log content | The API has no log-read operation (OQ-W8, CQ-6) | Inventing a logs endpoint |
| WD-30 | Silent renew uses the refresh token; without one, `prompt=none` in a hidden iframe, which needs `frame-src <issuer origins>` added to the CSP in `deploy/` (the PRD's CSP list does not name `frame-src`); iframe failure → session-expired flow | WEB-US-7.6 with memory-only tokens | Top-level redirect every hour (loses in-memory drafts) |
| WD-31 | Secret-bearing mutations bypass TanStack's mutation cache (`useSecretMutation`); secret inputs are uncontrolled and read by ref | WEB-8, WEB-US-11.2 ("not held in React state after the request is sent") | `useMutation` with scrubbing after the fact |
| WD-32 | The S6 component also renders for team roles in the team's *Agent identities* view, editable only when `teams:set-aws-accounts` is in the team's `permissions[]` | WEB-US-8.2 needs a team-admin view of the S6 filter, and S6 itself sits on the service admin team detail page | A second team-admin route outside the IA |
| WD-33 | `can()` without a team reads `Me.servicePermissions` when present, else `serviceAdmin` → all and `securityOperator` → its column | F-1: the OpenAPI has `servicePermissions`; the PRD rule is the fallback (CQ-4) | Ignoring `servicePermissions` |
| WD-34 | Streams own files (tasks.md *How to use*), shared lists pre-created with placeholders in M0-S3; `M6-X1` fails if any `NotBuiltYet` or `notImplementedPort` remains | Parallel worktrees without merge conflicts | Free-for-all edits |
| WD-35 | S8's overview is `/reports`, reached through *Governance › Cost reconciliation* (S8 tabs *Overview* and *Reconciliation*) and S1 links; the IA has no separate *Reports* item | PRD §4.1 lists only the reconciliation route for S8 | Adding a nav item outside the IA |

## 2. Contract questions raised with other repositories

| # | To | Question | Status |
|---|---|---|---|
| CQ-1 | `-restapi` | Tag a release with `api/openapi.yaml` and `api/contract/*.json` and merge `feat/restapi-feature-complete` to `main`, so the snapshot can move from a branch commit to a tag | Open; re-pin task M6-U1 |
| CQ-2 | `-restapi` | `ApiKey` lacks `version` while `DeleteApiKey`/`DeleteServiceApiKey` require `If-Match` | Open; interim WD-7 |
| CQ-3 | `-restapi` | Align the `IfMatchPut` parameter description with CD-2 (optional on `PUT`) | Open |
| CQ-4 | `-restapi` / root | Add `Me.servicePermissions` to contract §5 | Open |
| CQ-5 | root (J) | OQ-W1: mockups for S10, S11, T14, T15; T7 in the root IA | Open |
| CQ-6 | root (J) / `-restapi` | OQ-W8: what the agent *Logs* tab should show | Open; interim WD-29 |
| CQ-7 | platform, IdP admins | Dev environment, seeded users, IdP SPA registrations, CloudFront and `config.json` per environment | Open; `e2e:dev` only |
| CQ-8 | `-restapi` | `Team` and the service reports carry no agent count, so the S2 *Agents* column and the S1 agent total cannot be filled from one call | Open; S2 shows "—" (hover says why); S1 counts from the same source once available |
| CQ-9 | `Team` has no cluster name or IAM role ARN. T1 shows the cluster as "—" and takes the ARN from a `team_shared` agent's `iamRoleArn` (shown once such an agent exists). Needs a team-level field in the API. | M1-O1 |
| CQ-10 | No aggregate of agent counts or agent health per team: S1 reads `ListAgents` for the first 50 active teams, five at a time, and says how many teams were not read. Needs an agent count and a degraded count in a service report. | M1-D1 |
| CQ-11 | No reconciler-health endpoint: S1 reads the `reconciler` check of `GET /readyz` (else the overall status). Needs a documented check name. | M1-D1 |
| CQ-12 | `CreateIdentityProvider` and `UpdateIdentityProvider` take only `clientSecretArn`; no client secret value field exists ("the value never reaches AFS"), although the task list and the data dictionary expect a write-only value. S10 therefore takes the ARN in a normal field (an ARN is not a secret) and shows only the ARN; no `SecretInput` is used there. | M1-N3 |

## 3. Edge cases and solutions (seeded at spec time; extend during implementation)

| Case | Handling | Task |
|---|---|---|
| `nextToken` expired (24 h) or replayed by another caller → `ValidationError` | Table restarts from the first page with a notice "The list was refreshed" | M0-U3 |
| `X-Request-Id` longer than 64 characters | SDK throws a `TypeError` before sending | M0-C1 |
| `Retry-After` above 30 s on `429` | Throw `isThrottled` at once (no long sleeps in UI or pipelines) | M0-C4 |
| `GetMe` fails at boot (API down) | Full-page "AFS is not responding" with *Retry*, no shell | M0-H3 |
| Caller with no team and no service role (CD-10) | "No access yet" page with *Sign out*; no `ListTeams` call | M0-H10 |
| Token expiry with clock skew | Renew at `exp − 60 s` computed from the token response's `expires_in`, not the device clock alone | M0-A6 |
| Two tabs, one signs out | BroadcastChannel; the other tab clears memory and lands on `/signed-out` | M0-A8 |
| Draft form during session expiry | Non-secret fields kept in memory, secret fields cleared | M0-A7 |
| `409 team_suspended` racing a write | Shown as "Team is suspended", controls disabled | M1-Q1, M1-O4 |
| Unknown enum value or status phase | Raw text, grey dot, never an error | M0-D3, M0-D5 |
| Replayed `CreateApiKey` without `secretKey` | "Created but cannot be shown again" + *Delete key* | M1-M5 |
| `TestNotificationChannel` `202 pending` | Poll the channel status (CD-3) until delivered/failed | M3-N2 |
| Import bundle > 100 MB | Refused before upload | M4-E2 |
| Export download link older than 7 days | Shown expired; create a new export | M4-E1 |
| A screen still on its placeholder at the end | `M6-X1` fails | M6-X1 |

## 4. Deviations from plan

| # | Deviation | Task |
|---|---|---|
| DV-1 | The contract has 41 resource modules (23 top-level + 18 `admin.*`), not 42 as the spec counted; the 182 operations are all covered | M0-G1 |
| DV-2 | `meta` is read with an exported `metaOf(value)` helper (the generated return types do not carry `meta`); void and string results have none, so `withMeta()` was not built | M0-C1 |
| DV-3 | The C9 "no heap reference to secretKey after resolving" test is structural only: the client keeps no per-call state (private fields hold options, never bodies) and the debug hook and errors are scrubbed (tested). A real heap-snapshot test needs `node --expose-gc` and is left to M6-X | M0-C9 |
| DV-4 | `contract:update` rewrites the files and lock and tells the user to run `codegen`; it does not run codegen or print a diff itself | M0-S2 |
| DV-5 | `Versioned` carries optional `id`/`name`/`key` so that both a resource and a `{ id, version }` literal type-check | M0-C6 |
| DV-7 | The contract has 160 JSON 2xx response examples (170 counts every content type and status); all 160 replay through their SDK method | M0-P5 |
| DV-8 | Under Bun, Vitest's default forks pool fails to terminate workers (`setMaxListeners`); the Bun run uses `--pool=threads`. The Chromium run needs `PW_CHROMIUM_PATH` only where Playwright's own browser is not installed | M0-P4 |
| DV-9 | Non-secret form drafts are serialised to `sessionStorage` (`afs.drafts`) for the top-level re-authentication redirect and restored then removed at boot; secret values are never drafts and `SecretInput`s are cleared on expiry | M0-A7 |
| DV-10 | `OidcClient` is validated against an in-process fake IdP (`e2e/fake-afs/idp.ts`, shared with the Bun IdP server); ID-token signatures are not verified in the browser (oauth4webapi does not, TLS to the token endpoint is the trust root) | M0-A4 |
| DV-6 | SDK tests set `X-Request-Id` limits and Retry-After behaviour with an injected `sleep`; non-JSON error bodies map known statuses (401/403/404/412/428/429/503) to their code and others to `InternalError` | M0-C2 |
| DV-11 | Use cases of one area are methods of one class (`TeamsUseCases`) instead of one class per file; each method is one use case | M1-T1 |
| DV-12 | `AppServices` (`presentation/services.tsx`) is built by `buildServices()` in `main/wiring.ts` as a `Partial`: an area no stream has wired is absent and `useService` throws "not wired"; `notImplementedPort` is no longer used for new areas (M6-X1 checks `buildServices` returns every area) | M1-T1 |
| DV-13 | Small shared helpers added without an owning stream: `components/Controls.tsx` (`TextInput`, `SelectInput`, `Card`, `Toolbar`), `hooks/gate.ts` (`gate(me, permission, teamId)` → "Requires <role>"), `testing/screen.tsx` (`renderScreen`), `testing/teams.ts` (fake teams port) | M1-T2 |
| DV-14 | The browser-global rule in `architecture.test.ts` ignores a name inside a hyphenated word (`context-window` in the generated CLI table); a red-case test proves a real `window` or `fetch` reference is still caught | M1-L1 |
| DV-15 | `codegen` writes a second target, `apps/console/src/domain/generated/cliOperations.ts`, from `consoleEmitters` (`emitters.ts`); `codegen:check` covers both. `scratchSizeGiB` becomes `--scratch-size-gib`; only credentials in `SECRET_FIELDS` are CLI secrets (a write-only `ceilingOverrideReason` is an ordinary flag); a secret `value` renders `--secret-value file://<path>` | M1-L1 |
| DV-16 | The fake AFS server tracks resource versions from every response (single resources and list items) so `If-Match` is judged against what the console saw; fixture modules may register a reset in `fixtureResets`; the seeded service admin now holds every permission in `servicePermissions` (the contract says "all for service admins") | M1-T9 |
| DV-17 | `/teams/:teamId/admin` and `/teams/new` have no navigation item, so the route guard cannot hide them; their screen entry points (`s2-teams/index.tsx`, `s3-create-team/index.tsx`) render the not-found page for anyone but a service admin | M1-T4 |
| DV-18 | The *Models* tab is `/t/:teamId?tab=models`, not `/t/:teamId/models` (M1-O2): routes are generated from `navigation.ts` items and a nav item for a tab would add a menu entry; a sub-route would be a 404. | M1-O2 |
| DV-19 | `useTeamWriteGate` and `TeamLayout` read the team through the shared `teamKey` query, enabled only for service admins and callers bound to the team; `renderApp` (shell tests) now provides empty team and overview services via `shellScreenServices` because `/t/:id` renders the real T1. | M1-O4 |
| DV-20 | A new API key's expiry is computed at submit as now + N days, minus one minute when N is 90, so the API's "at most 90 days ahead" holds despite clock skew (M1-M2). | M1-M2 |
| DV-21 | S1 sums each live team's `maxBudgetUsd` as "the sum of budgets" (as S2 does) and takes month-to-date spend from the usage report grouped by team, rather than reading each team's `GetBudget` (N calls). *Reverted drift* is a `DriftCorrected=True` condition changed within 24 h on the team or one of its agents. | M1-D1, M1-D2 |
| DV-22 | S10 section ids follow the navigation (`general` for *Settings*, `identity-providers`); the section is read from the path because the navigation items are literal routes (`/settings/general`) with no `:section` parameter. *Delete* for identity providers is not offered: *Disable* is the removal path the PRD names. | M1-N1, M1-N3 |
| DV-23 | The audit CSV e2e intercepts the `text/csv` request in the spec (`context.route`, no real API) because the fake AFS server answers JSON only; the unit and SDK tests cover the CSV path. Revision diffs read both revisions with `GetRevision` (the list omits the snapshot) and show snapshots as key-sorted JSON through `DiffView`. | M1-H1, M1-H2 |

## 5. Lessons learned

Filled in at completion.
