# PRD: `-website` feature complete, code and design review fixes

| | |
|---|---|
| **Source** | Step 5 (code and design review) of `implm-frm-prd` on branch `feat/website-feature-complete` at `cdc14f7` |
| **Spec reviewed against** | `specs/261121-website-feature-complete/` (spec.md, tasks.md, implementation-notes.md WD-1..WD-n, DV-1..DV-62, CQ-1..CQ-26) and `AGENTS.md` |
| **Reviewed** | 2026-11-22 by the step 5 review agent (J authorized running without questions) |
| **Status** | Reviewed by step 6 (`review-prd`), section 9. Ready for `create-spec` (step 8) |
| **Scope** | `packages/sdk` (`@afs/sdk`) and `apps/console` (`@afs/console`). No other repository changes |

## 1. Executive summary

**Overall assessment: request changes (no blocker).** The branch is in good shape for what is usually the
riskiest part of a console like this. The SDK has no runtime dependencies. Its public surface comes only
from `src/index.ts`, and the generated code is guarded by `codegen:check`. It reuses idempotency keys
across retries, sends `If-Match`, and has redaction tests. The console's dependency rule is enforced by
`architecture.test.ts`, which also checks browser globals, XSS sinks and storage. The permission catalog
is byte-identical to `-restapi` `api/contract/permissions.json` at `af5cd82` (sha256 `27d93f6f…`), and
the drift test covers every one of the 58 permissions. Secret values follow WD-31: uncontrolled inputs,
`useSecretMutation`, a one-time dialog and sentinel e2e checks. Telemetry carries route templates, the
build and request ids only. `bun run gate` was green at `cdc14f7`. Biome reports 0 errors and 12
warnings. The architecture and permission suites (88 tests) pass.

The findings are in the places the gate and the fake-backed e2e suite cannot see:

- **Session lifecycle under real conditions.** Silent renewal through a hidden frame is blocked by the
  console's own CSP (`frame-ancestors 'none'`, and `frame-src` without `'self'`). Only `GetMe` turns a
  `401` that survives the refresh into "Your session has expired". The re-authentication dialog promises
  that typed values are kept, but no form ever saves a draft. An idle second tab signs out the tab the
  user is working in.
- **The API's `AccessDenied` is not always treated as the real answer.** Mutations that skip the
  TanStack mutation cache (`useSecretMutation`, `useVersionedForm`) never reach the shell's access-denied
  alert or the `GetMe` refresh. The create-secret, rotate-secret and create-API-key dialogs hide the
  denial completely.
- **SDK edge cases.** Smaller issues: retry rules, a non-JSON 2xx body, `waitFor` acting on a stale
  status, and redaction of short values.

Counts: **P0 0 · P1 6 · P2 15** (21 findings). No finding is a true blocker. No secret value or token
reaches storage, a URL, logs or telemetry on any path that was reviewed, and the API stays the
enforcement point everywhere. The P1s are correctness and security-hardening defects that should be
fixed before release.

### Review method

The review read the code and ran targeted checks, not the full e2e suite. It covered the SDK core
(`client.ts`, `errors.ts`, `retry.ts`, `pagination.ts`, `auth.ts`, `wait.ts`, `index.ts`, the generated
operation table), the console session and auth code (`Session`, `Boot`, `CompleteSignIn`,
`ReAuthenticate`, `IdleMonitor`, `OidcClient`, the storage adapters, `main.tsx`), the query layer, the
secret components and hooks, `architecture.test.ts`, the permission tests, the deploy headers, config
parsing and telemetry. It used greps for `any`, TODO/placeholder/NotBuiltYet, `console.*`, XSS sinks,
storage, and `href`s that take API data. It also ran `vitest` on `architecture.test.ts`,
`permission.test.ts` and `permissionDenied.test.ts`, ran `biome check .`, and compared
`permissions.json`, `operations.json` and `openapi.yaml` byte for byte with `-restapi`.

### Positive observations

- `AfsClient.#execute` makes one idempotency key per logical call and reuses it on every retry
  (`client.ts:287`). The SDK reads first for id-only writes and reports `appliedToVersion`.
- `errorFromBody` redacts the bearer token and the request's secret fields from messages and `details`
  (`errors.ts:117-136`). The debug hook never carries a body.
- `SecretInput` is uncontrolled and registered for a global wipe. `OneTimeSecretDialog` writes the
  value through `textContent` from a ref, never through state.
- `safeReturnTo` blocks open redirects (`Boot.ts:18-20`). The OIDC client uses PKCE S256, `state` and
  `nonce`, and refuses `http` issuers outside the e2e build.
- `permissionDenied.test.ts` has a generated denied case for every permission and role, and fails on
  any gate that names an unknown permission.
- `architecture.test.ts` keeps red-case tests for its own rules.

## 2. Problem statement

The console and SDK pass their gate against a fake API and a fake IdP that always issues refresh tokens.
Some production behaviors are therefore unproven or broken: silent renewal without a refresh token, a
token revoked server-side, re-authentication with an unsaved form, several open tabs, and a stale
permission that the API denies on a secret write. A few SDK paths do not follow the PRD's SDK-6 and
SDK-10 rules to the letter. Developers and pipelines that use `@afs/sdk`, and service admins,
team-admins and viewers who use the console, are affected.

## 3. Goals and non-goals

### Goals

1. Every P1 finding is fixed with a failing test first (section 7).
2. Every P2 finding is fixed, or deferred with a written reason in the fixes spec.
3. `bun run gate` stays green, `architecture.test.ts` is not weakened, and coverage on `domain` and
   `application` stays at 90% or more.

### Non-goals

- New features, screens or contract changes. Contract gaps stay with `-restapi` (CQ-1..CQ-26).
- The re-pin to the `-restapi` release tag (M6-U1, deferred: section 8).
- Changing the chosen libraries (oauth4webapi, TanStack Query, React Router) or the WD-31 design.
- Visual redesign. Baselines change only where a fix changes a screen.

## 4. Non-functional requirements for the fixes

| Area | Requirement |
|---|---|
| Security | No fix may put a token or secret value in storage, a URL, React state, the query or mutation cache, logs or telemetry. The sentinel e2e (`quality/secrets-sentinel.spec.ts`) stays green and is extended where a fix touches a secret path. CSP keeps `script-src 'self'` with no `unsafe-inline` or `unsafe-eval` |
| Reliability | Session fixes keep a working tab working: no sign-out, cache clear or lost non-secret input except on explicit sign-out, real idle or real expiry |
| Performance | No extra request per poll cycle. Retries added or removed by a fix are bounded and honor `Retry-After` |
| Observability | New error paths keep sending only the error class name, route template and request id to telemetry |
| Accessibility | Any new alert or dialog has the right role (`alert`, `dialog`), a label and keyboard reachability. Axe stays clean |
| Quality | TDD (red first) per fix. `bun run gate` green per commit. Coverage thresholds stay on |

## 5. Dependencies

- `-restapi` (`feat/restapi-feature-complete`, `af5cd82` at review time): the authz catalog that the
  drift test compares against. A fix must not change `permission.ts` unless `permissions.json` changes.
- Platform Terraform: it consumes `apps/console/deploy/response-headers-policy.json`. FR-001 changes
  that file, so the platform must pick up the new CSP before the console relies on frame renewal.
- Root spec authority: FR-001 departs from spec FR-037 / PRD §6.2 (`frame-ancestors 'none'`). It needs
  an ADR in `docs/architectural-decision-record.md` and a line in the fixes spec's implementation notes.

## 6. Functional requirements (one per finding)

Priorities: **P0** = true blocker (security breach, data loss or a broken core flow, with no workaround) ·
**P1** = high (a real defect or security hardening, fix before release) · **P2** = medium (correctness
edge case, test gap or hygiene).

### P1

#### FR-001 (P1): Silent renewal in a frame is blocked by the console's own CSP

- **Evidence:** `apps/console/deploy/response-headers-policy.json:10` sets `frame-ancestors 'none'` and
  `frame-src <issuers>`. `OidcClient.renewInFrame` (`src/infrastructure/auth/OidcClient.ts:182-220`)
  loads the IdP in a hidden frame of the console. The IdP then redirects that frame to the console's
  `/auth/callback`. That response carries `frame-ancestors 'none'`, so the browser refuses to render it.
  The redirect target is also same-origin, which `frame-src <issuers>` does not allow. The frame times
  out after 10 s, `Session.#doRenew` expires the session (`Session.ts:121-129`), and every user of an IdP
  that issues no refresh token gets "Your session has expired" once per token lifetime. The unit test
  (`OidcClient.test.ts:178`) uses a plain element and no CSP. `deploy/build-output.test.ts:62-72` and
  `e2e/specs/quality/csp.spec.ts:20` assert the blocking values. The fake IdP always issues refresh
  tokens (`e2e/fake-afs/idp.ts:50`), and no e2e test turns them off.
- **Acceptance criteria:**
  1. The policy allows the console's own callback to load in its own frame and still blocks framing by
     any other origin. For example: `frame-ancestors 'self'` and `frame-src 'self' <issuers>`.
     `build-output.test.ts` and `csp.spec.ts` assert the new values.
  2. A new e2e test serves the build through the deploy headers with the fake IdP's refresh tokens off
     (`setRefreshTokens(false)`). It lets the token reach `exp − 60 s` and proves that the session renews
     through the frame with no session-expired dialog and no CSP violation.
  3. An ADR records the departure from spec FR-037 (`frame-ancestors 'none'`) and the reason (WD-30).
     The ASVS row V3.7 in implementation notes §4b names the new test.

#### FR-002 (P1): `AccessDenied` from mutations outside the mutation cache is hidden or not routed to the shell

- **Evidence:** `src/presentation/query/createQueryClient.ts:24-41` reports `AccessDenied` (alert naming
  `requiredPermission` plus a `GetMe` refresh, W-2) only from the TanStack query and mutation caches.
  `useSecretMutation` (`src/presentation/hooks/useSecretMutation.ts:16-37`) and `useVersionedForm`
  (`src/presentation/hooks/useVersionedForm.ts:52-70`) skip both caches on purpose. Their errors
  therefore never reach the shell. The dialogs then hide the denial:
  `t4-secrets/SecretDialogs.tsx:115` (create secret) and `:223` (rotate), and
  `t6-members/ApiKeysTab.tsx:228` (create API key), all render `err && !err.isAccessDenied && …`. A
  caller whose permission was revoked after `GetMe` clicks *Create secret*. The request is denied, the
  secret input is wiped, and nothing tells them why. The `useVersionedForm` dialogs (budget, team,
  settings, identity provider, members, sign-in provider, agent edit) show the denial as a generic
  error, without the required permission and without refreshing `GetMe`. This breaks WEB-3, WEB-US-8
  ("An `AccessDenied` from any call shows an alert naming `details.requiredPermission` and the request
  id"; "`GetMe` is fetched … after any `AccessDenied`") and the AGENTS.md rule "Always handle
  `AfsError.isAccessDenied` from the API as the real answer". No component test covers a denied create
  or rotate secret, or a denied create API key.
- **Acceptance criteria:**
  1. Errors from `useSecretMutation` and `useVersionedForm` go to the same reporter as the caches (one
     function exported from `presentation/query/`, so behavior stays in one place). An `AccessDenied`
     shows the shell alert with `requiredPermission` and the request id, and triggers one `GetMe`
     refresh. Neither the secret value nor the variables reach the reporter, the cache or React state:
     the sentinel e2e test proves it.
  2. Component tests, one for each of the three secret dialogs (create secret, rotate secret, create
     API key) and one for the service API key dialog, fake an `AccessDenied` from the port. Each asserts
     that the access-denied alert is visible with the permission and request id, the secret input is
     cleared, and the dialog does not close as if it succeeded.
  3. One `useVersionedForm` dialog (budget) has the same denied-case test.

#### FR-003 (P1): An API `401` that survives the SDK refresh expires the session only for `GetMe`

- **Evidence:** `src/main/main.tsx:105-114` calls `session.expire()` only when `GetMe` maps to
  `unauthenticated`. `createQueryClient.ts:24-30` does nothing for `unauthenticated`, and the hooks in
  FR-002 do not either. A token revoked or rejected server-side while the IdP renewal still succeeds
  (for example a disabled user, a changed audience, or a clock problem) leaves the console "active".
  Every list and write then fails with an error alert, and the session-expired dialog never appears.
  This breaks WEB-US-7: "Given an API `401` that survives the SDK's one refresh, the console shows 'Your
  session has expired', keeps the route and non-secret form values in memory, clears secret fields, and
  re-authenticates". The only tests call `session.expire()` directly (`screens.test.tsx:230`).
- **Acceptance criteria:**
  1. An `unauthenticated` `AppError` from any query, any cache mutation or either bypass hook (FR-002)
     calls `session.expire()` once.
  2. A unit test of the query client and an e2e test cover the case: the fake API answers `401` to
     `ListAgents` twice, the IdP renews, the session-expired dialog appears on the same route, and
     secret inputs are empty.
  3. While the dialog is open, no further API request is sent for that query (no retry storm).
- **Streams:** C adds the `onUnauthenticated` hook to the query layer. B wires it to
  `session.expire()` in `main.tsx` (merge order, section 7.4).

#### FR-004 (P1): Non-secret drafts are never saved, so re-authentication loses typed values

- **Evidence:** `DraftStore.save` (`src/application/usecases/session/DraftStore.ts:6`) has no caller
  anywhere in `src/presentation`, and no component reads `drafts.get`. `ReAuthenticate`
  (`ReAuthenticate.ts:17-20`) persists `drafts.snapshot()`, which is always empty, and then does a
  top-level redirect that discards all React state. The dialog still promises: "You will return to this
  page; anything typed that is not a secret is kept" (`src/presentation/auth/screens.tsx:245`). DV-9,
  ADR-012 and WEB-US-7 ("keeps … non-secret form values") describe behavior that does not exist. The
  draft path is dead code.
- **Acceptance criteria:**
  1. A presentation hook (for example `useDraft(formId, initial)`) reads and writes `AuthServices.drafts`
     for non-secret fields. It is adopted by at least T3 *Create agent*, S3 *Create team*, P3 *Create
     work order*, *Create pool* and the non-secret fields of *Create secret* and *Create API key*. A
     field rendered by `SecretInput` can never be passed to it: this is enforced by type or by a test.
  2. An e2e test fills T3 with non-secret values and a secret value, forces expiry, signs in again
     through the fake IdP, and lands on T3 with the non-secret values restored and the secret empty.
     A storage scan shows no secret value in `sessionStorage` at any point.
  3. Drafts are discarded on submit success, on cancel and on sign-out, including the `afs.drafts`
     sessionStorage key (today `Session.signOut` clears only memory).

#### FR-005 (P1): An idle tab signs out the tab the user is working in

- **Evidence:** each tab runs its own `IdleMonitor`, reset only by input events in that tab
  (`src/main/main.tsx:140-144`, `IdleMonitor.ts`). When it fires, it calls `SignOut`. That broadcasts
  `signout` (`Session.ts:79-90`), and every other tab clears its tokens and caches and navigates to
  `/signed-out` (`SignedOutWatcher`). A user who leaves a second tab open for longer than
  `idleTimeoutMinutes` (default 60) is signed out mid-task in the active tab, and the IdP session is
  ended too.
- **Acceptance criteria:**
  1. Activity is shared across tabs, for example a throttled `activity` message (at most one every
     30 s) on the session channel that resets every tab's monitor. Idle sign-out happens only when no
     tab has had input for the configured time.
  2. Unit tests cover `IdleMonitor` and the channel with a fake clock: input in tab A keeps tab B from
     signing out, and no input anywhere signs out both.
  3. The channel accepts only the known messages (`signout`, `activity`), and an activity message
     carries no data.

#### FR-006 (P1): `config.json` accepts `http://` for `apiUrl` and `redirectUri` in the production build

- **Evidence:** `src/application/ports/config.ts:37-44` (`isHttpUrl`) accepts `http:`, and
  `parseConfig` uses it for `apiUrl`, `redirectUri` and `telemetryUrl` (`:73-79`). A wrong environment
  config would send bearer tokens and secret values to the API in clear text. The OIDC client already
  refuses `http` issuers outside the e2e build (`main.tsx:67-68`). The API URL has no such guard. This is
  a security hardening finding, so it is P1 under the review rules even though `config.json` is
  operator-controlled.
- **Acceptance criteria:**
  1. Outside the e2e and dev builds, `apiUrl`, `redirectUri` and `telemetryUrl` must be `https:`
     (`localhost` may be allowed for `vite dev` only). Any other value gives the configuration error
     page with a reason naming the field.
  2. `config.test.ts` covers each field with `http://example.com` (refused), `https://…` (accepted) and
     the dev and e2e exception.

### P2

#### FR-007 (P2): SDK network-error retry is "anything but PATCH" instead of the SDK-6 allow-list

- **Evidence:** `packages/sdk/src/core/client.ts:346`, `const safe = def.method !== "PATCH"`. SDK-6
  says network errors and `idempotency_in_progress` are retried "only for `GET`, `PUT`, `DELETE` and
  `POST` with an `Idempotency-Key`". This is correct today only because every POST in the pinned
  contract is `idempotent: true`. A future POST without a key would be retried after a network error
  and could run twice. `idempotency_in_progress` (`:384-386`) has no method check.
- **Acceptance criteria:** retry eligibility is computed from the method and the presence of the
  `Idempotency-Key` header. `transport.test.ts` adds a red case with a synthetic POST
  `OperationDef` that has `idempotent: false` and gets one attempt only on a network error, plus a
  PATCH case.

#### FR-008 (P2): A 2xx response with a non-JSON body throws a raw `SyntaxError`

- **Evidence:** `client.ts:104-107` parses any non-text, non-YAML 2xx body with `JSON.parse`. An HTML
  page from a proxy, or a truncated body, throws `SyntaxError`, not an `AfsError` with a request id.
  This is against SDK-10 (wire fidelity) and FR-010.
- **Acceptance criteria:** a non-parseable 2xx body rejects with an `AfsError` (`code` `InternalError`,
  `status` the HTTP status, `requestId` from `X-Request-Id`, a message with no body text over 200
  characters). A test covers `200 text/html` and a truncated JSON body.

#### FR-009 (P2): Non-JSON `409` (and other unlisted statuses) map to `InternalError`

- **Evidence:** `packages/sdk/src/core/errors.ts:96-105`. `STATUS_CODES` has no `409` (`Conflict`),
  so a non-JSON 409 from a proxy or gateway becomes `InternalError` and `isConflict` is false. DV-6
  records the list but not why 409 is missing.
- **Acceptance criteria:** `409 → Conflict` is added, and so is `500 → InternalError` (explicit). The
  table-driven test in `errors.test.ts` covers every mapped status and one unmapped status.

#### FR-010 (P2): Secret redaction skips values of 3 characters or fewer

- **Evidence:** `client.ts:294-296`, `.filter((v) => typeof v === "string" && v.length > 3)`. A short
  secret value would not be redacted from an error message that echoes it. The threshold is there to
  avoid redacting common substrings, but SDK-11 says secret values are "never" included in errors.
- **Acceptance criteria:** either every non-empty secret field value is redacted, or values under the
  threshold are refused before sending with a `TypeError` that does not contain the value. A
  `hygiene.test.ts` case uses a 1-character value that an error message echoes.

#### FR-011 (P2): `waitFor` rejects on a stale `Failed` or `Degraded` status

- **Evidence:** `packages/sdk/src/resources/wait.ts:78-84` checks `observedGeneration >= generation`
  only for the success case. A `Failed` or `Degraded` status from before the latest change
  (`observedGeneration < generation`) rejects at once, when it should keep waiting for the reconciler.
  Contract §1 ("mutations return `Pending` at once") makes this rare. A status read from a separate
  `…/status` endpoint, or read after another client's change, can still be stale.
- **Acceptance criteria:** `Failed` and `Degraded` end the wait only when `observedGeneration >=
  generation`. Otherwise polling goes on until the timeout. `wait.test.ts` adds the stale-`Failed`
  case.

#### FR-012 (P2): Abandoned PKCE flows stay in `sessionStorage`, and `put` is not guarded

- **Evidence:** `OidcClient.begin` (`OidcClient.ts:75-81`) stores a flow (verifier, nonce, provider)
  for every sign-in and every frame renewal (`:187`). Only `complete` removes it (`take`). A timed-out
  renewal frame, or a sign-in that is abandoned at the IdP, leaves `afs.flow.<state>` behind, one per
  renewal attempt for the life of the tab. `SessionFlowStore.put` (`SessionFlowStore.ts:31-33`) is the
  only storage call without `try/catch`. When storage is blocked, the sign-in page shows "The sign-in
  provider could not be reached", which is misleading.
- **Acceptance criteria:**
  1. Flows carry a creation time. `put` removes flows older than 10 minutes and caps the entries at 5,
     and a renewal that times out removes its own flow.
  2. A blocked `sessionStorage` produces an `AuthError` with a message saying that browser storage is
     required for sign-in.
  3. Unit tests cover expiry, the cap, removal after a frame timeout and blocked storage.

#### FR-013 (P2): A `login_required` callback drops the return route

- **Evidence:** `src/presentation/auth/screens.tsx:147` navigates to `/sign-in` with no `returnTo`
  when `CompleteSignIn` returns `login-required`. `OidcClient.complete` throws before it can return
  `flow.returnTo` (`OidcClient.ts:107-111`). With more than one provider, a reload of
  `/t/team_x/agents` after the IdP session ended shows the picker and then lands on `/`.
- **Acceptance criteria:** the `login-required` outcome carries the flow's `returnTo`, and the sign-in
  page receives it as `?returnTo=` (still through `safeReturnTo`). An e2e test with two providers
  proves the original route is restored.

#### FR-014 (P2): The session-expired dialog has no error path

- **Evidence:** `src/presentation/auth/screens.tsx:222-233`. If `listProviders.execute()` or
  `reAuthenticate.execute()` rejects, for example because the IdP discovery fails, the promise is
  dropped (`void reauth()`) and the button stays disabled. If no provider is found, the dialog
  re-enables with no message.
- **Acceptance criteria:** both failures show an `Alert` with role `alert` inside the dialog and
  re-enable *Sign in again*. A component test covers each.

#### FR-015 (P2): Query retries stack on top of SDK retries and ignore `Retry-After`

- **Evidence:** `createQueryClient.ts:45` retries every query up to 2 more times for any kind except
  access-denied, not-found, unauthenticated, validation and stale. A `503` or network failure already
  retried 3 times by the SDK therefore becomes up to 12 requests. A `Throttled` that the SDK gave up on
  because `Retry-After` was over 30 s (`client.ts:388-391`) is retried by TanStack Query after its
  default 1 s or 2 s delay. That breaks WEB-US-9.5 and the edge case "Throw `isThrottled` at once (no
  long sleeps)".
- **Acceptance criteria:** queries do not retry `throttled`, `unavailable` or `network` (the SDK
  already did). Other kinds keep at most one retry. A query test counts requests for each kind against
  a fake port.

#### FR-016 (P2): `architecture.test.ts` no longer scans tests or dynamic imports

- **Evidence:** `src/architecture.test.ts:68,74,85`. The dependency rule now skips `*.test.ts(x)`,
  which the scaffold's version scanned. `importsOf` (`:42-43`) matches `from "x"` and `import "x"`
  but not `import("x")`, so a lazy import of `infrastructure/` or `@afs/sdk` from `presentation`
  passes. `presentation/routes/registry.tsx` already uses `lazy(() => import(…))`. AGENTS.md says to
  extend this test and never weaken it.
- **Acceptance criteria:**
  1. `importsOf` also matches `import("…")` and `export … from "…"`, with red-case tests.
  2. Test files are scanned again, with an explicit allow-list (for example `presentation` tests may
     import `application/errors.js`). Every allow-list entry has a comment giving its reason.

#### FR-017 (P2): Coverage excludes `application/ports/**`, which holds logic

- **Evidence:** `apps/console/vitest.config.ts:20` excludes `src/application/ports/**`. `ports/config.ts`
  (`parseConfig`, the security-relevant config validator, 106 lines), `ports/auth.ts` (`AuthError`)
  and `ports/preferences.ts` hold executable code. They have tests, but the 90% threshold does not
  apply to them.
- **Acceptance criteria:** the exclusion covers only type-only files: an explicit list, or a pattern
  plus a test that fails when an excluded file has a runtime export. `test:cover` stays at 90% or more.

#### FR-018 (P2): 12 Biome warnings, including unused imports in production code

- **Evidence:** `bunx biome check .` at `cdc14f7` gives 12 warnings. Unused imports are in
  `application/usecases/config/ConfigUseCases.ts:5`, `application/usecases/settings/SettingsUseCases.ts:9`
  and `presentation/screens/t3-create-agent/sections/IdentitySection.tsx:1`. There is
  `useOptionalChain` in `t1-overview/ephemeral/EphemeralCard.tsx:34`, plus unused variables or imports
  and `noCommaOperator` in tests, e2e fixtures and testing helpers (`IdentityUseCases.test.ts:11`,
  `NotificationsUseCases.test.ts:39`, `testing/identity.ts:55`, `testing/notifications.ts:41`,
  `SettingsPage.test.tsx:9,36`, `e2e/fake-afs/fixtures/overview.ts:7`, `e2e/specs/shell/shell.spec.ts:4`).
- **Acceptance criteria:** `bunx biome check .` reports 0 warnings. The root `lint` script uses
  `--error-on-warnings`, or `biome.json` raises these rules to error, so they cannot come back.

#### FR-019 (P2): Secondary queries fail silently

- **Evidence:** `t11-reports/ReportSection.tsx:30-37` (tag keys for *Group by tag*),
  `s9-cost-tags/SpendSection.tsx:12-16` (tag keys) and `t1-overview/ephemeral/EphemeralCard.tsx:28-32`
  (budget burn) render the same empty or "—" state whether the call failed or returned nothing. NFR-4
  says "a failing widget shows its own error".
- **Acceptance criteria:** each shows an inline error with the request id and *Retry* when its query
  fails, separate from the empty state. A component test with a failing port covers each.

#### FR-020 (P2): Links built from API data are not scheme-checked at the edge

- **Evidence:** `presentation/screens/p6-work-order/index.tsx:204` renders `<a href={r.prUrl}
  target="_blank">`, where `prUrl` is reported by agents through `work-orders:report` (untrusted per
  AGENTS.md). `s11-export-import/ExportsCard.tsx:152` renders `downloadUrl`. The adapters
  (`infrastructure/sdk/workOrders.ts:50`, `adminExports.ts:29`) pass both through unchecked. React 19
  and `script-src 'self'` block `javascript:` URLs today, so this is defense in depth only.
- **Acceptance criteria:** the adapters keep only `https:` URLs (anything else becomes `undefined`,
  shown as "—"). Adapter tests cover `javascript:`, `data:`, `http:` and `https:`.

#### FR-021 (P2): T3 combines several mutations behind one button without an ADR

- **Evidence:** DV-28. T3 sends `CreateAgent` and then one `PutAgentConfigValue` per value because the
  create request has no configuration values (CQ-14). Spec §3 lists "no client-side workflows that
  combine several mutations behind one button" as a non-goal. The partial-failure handling (agent kept,
  failed values listed with a link to T7) is described in implementation notes but not in an ADR, and
  not tied to CQ-14 for removal.
- **Acceptance criteria:** an ADR records the exception, the partial-failure behavior and the removal
  trigger (CQ-14 resolved upstream). A component or e2e test proves the partial-failure path: one value
  refused, the agent created, and the refused value listed with the T7 link. Add the test if it does
  not exist yet.

## 7. Implementation guidance (for steps 8 and 9)

### 7.1 Process for every fix

- **TDD, Red → Green → Refactor, for every FR.** Write the failing test named in the acceptance criteria
  first and check that it fails for the stated reason. Then write the least code that passes, then
  refactor and rerun. Security fixes (FR-001, FR-002, FR-006) also extend the sentinel or CSP e2e tests.
- **A code and design review per fix** before it is committed. Use AGENTS.md's checklist: dependency
  rule, `can(...)` plus `AccessDenied`, no secret in state, URL, storage or logs, no `any`, external data
  narrowed at the edge, accessibility and no hardcoded endpoints. Record any minor finding as a task in
  the fixes spec.
- **`bun run gate` green on every commit.** Commits reference the fixes spec directory.
- **Fix P1s before P2s within each stream.**
- **Update the fixes spec's `status.md` after every task** (mandatory).

### 7.2 Agent teammates and git worktrees

Run each stream below as its own worker agent teammate, in its own git worktree on a branch off
`feat/website-feature-complete` (for example `git worktree add ../w-rf-a -b rf/a`). Streams own disjoint
files (**Owns**). A stream that needs a change in another stream's file asks that stream's owner, or
waits for the merge order. It never edits the file itself. The coordinator merges the stream branches
into `feat/website-feature-complete` in the order in 7.4 and runs `bun run gate` after each merge.

### 7.3 Fix streams

| Stream | Findings | Owns (exclusive) |
|---|---|---|
| **A: SDK** | FR-007, FR-008, FR-009, FR-010, FR-011 | `packages/sdk/src/core/**`, `packages/sdk/src/resources/**` (tests included). Not `src/generated/**` or `contract/**` |
| **B: Session, auth and hosting** | FR-001, FR-003 (wiring part), FR-005, FR-006, FR-012, FR-013, FR-014 | `apps/console/src/application/usecases/session/**`, `src/application/ports/auth.ts`, `src/application/ports/config.ts` (+ tests), `src/infrastructure/auth/**`, `src/infrastructure/storage/**`, `src/infrastructure/config/**`, `src/presentation/auth/**`, `src/main/main.tsx`, `apps/console/deploy/**`, `e2e/fake-afs/idp.ts`, `e2e/specs/auth/**`, `e2e/specs/quality/csp.spec.ts`, and the ADR for FR-001 in `docs/architectural-decision-record.md` |
| **C: Error routing** | FR-002, FR-003 (query-layer part), FR-015 | `apps/console/src/presentation/query/**`, `src/presentation/hooks/useSecretMutation.ts`, `src/presentation/hooks/useVersionedForm.ts`, `src/presentation/shell/AccessDeniedProvider.tsx`, `src/presentation/shell/ShellContext.tsx`, `src/presentation/screens/t4-secrets/**`, `src/presentation/screens/t6-members/ApiKeysTab.tsx`, `src/presentation/screens/s10-settings/tabs/service-api-keys/**`, `src/presentation/screens/t5-budget/**`, `e2e/specs/quality/secrets-sentinel.spec.ts` |
| **D: Drafts** | FR-004, FR-021, FR-018 (the `IdentitySection.tsx` warning) | new `apps/console/src/presentation/hooks/useDraft.ts` (+ test), `src/presentation/screens/t3-create-agent/**`, `src/presentation/screens/s3-create-team/**`, `src/presentation/screens/p3-work-orders/CreateWorkOrderPage.tsx`, `src/presentation/screens/p4-pools/CreatePoolPage.tsx`, a new e2e `e2e/specs/auth/drafts.spec.ts` (B gives this one path to D), and the FR-021 ADR entry. Adopting drafts in the *Create secret* and *Create API key* dialogs (C's files) waits until C has merged, and is then done by D |
| **E: Quality and edges** | FR-016, FR-017, FR-018 (all but `IdentitySection.tsx`), FR-019, FR-020 | `apps/console/src/architecture.test.ts`, `apps/console/vitest.config.ts`, `biome.json`, root `package.json` (`lint` script only), `src/application/usecases/config/ConfigUseCases.ts`, `src/application/usecases/settings/SettingsUseCases.ts`, the test and testing files listed in FR-018, `e2e/fake-afs/fixtures/overview.ts`, `e2e/specs/shell/shell.spec.ts`, `src/presentation/screens/t11-reports/ReportSection.tsx`, `src/presentation/screens/s9-cost-tags/SpendSection.tsx`, `src/presentation/screens/t1-overview/ephemeral/**`, `src/presentation/screens/p6-work-order/**`, `src/presentation/screens/s11-export-import/**`, `src/infrastructure/sdk/workOrders.ts`, `src/infrastructure/sdk/adminExports.ts` (+ their tests) |

`docs/architectural-decision-record.md` is shared by B (FR-001) and D (FR-021). Each appends one ADR, D
after B in merge order, to avoid conflicts. `README.md`, `user-docs/` and the spec are updated by the
coordinator after the merges, as step 11 checks.

### 7.4 Merge order

1. **A (SDK)**: independent. It can merge first or at any time.
2. **E (quality and edges)**: merges early, so the stricter `architecture.test.ts` and lint rules
   (FR-016, FR-018) gate every later merge. If a stream fails the new rules after E lands, the failing
   stream fixes its own files.
3. **C (error routing)**: adds the shared reporter and the `onUnauthenticated` hook to the query layer.
4. **B (session, auth and hosting)**: wires `onUnauthenticated` to `session.expire()` in `main.tsx`
   (FR-003). It depends on C.
5. **D (drafts)**: last. It depends on B's session behavior for its e2e test and on C for the dialog
   adoption.

After each merge: `bun run gate`, then the Chromium e2e subset for the merged stream (`e2e/specs/auth`,
`quality`, `secrets`, `members` and the screens the stream touched).

## 8. Deferred: known open items out of reach in this step (not findings)

| Item | Why deferred | Owner |
|---|---|---|
| M6-U1: re-pin the contract snapshot to the `-restapi` release tag | `-restapi` `feat/restapi-feature-complete` is not merged or tagged yet (CQ-1, DV-62). The pinned `openapi.yaml` (sha256 `0e90eb4a…`) differs from `-restapi` HEAD `af5cd82` (`000118d7…`); `permissions.json` and `operations.json` are byte-identical | Coordinator, after the `-restapi` merge and tag |
| Firefox and WebKit e2e projects | Run in CI only; not run in this environment | CI |
| Visual baseline approvals | 33 entries in `apps/console/e2e/visual/approvals.json` are `pending` until J compares them side by side with the mockups (W-3) | J |
| CQ-2..CQ-26 interim behaviors | Contract gaps recorded in implementation notes §2. The console's interim handling was reviewed and is not counted as a finding (except FR-021, which needs an ADR) | `-restapi` / root (J) |

## 9. Step 6 review (`review-prd`, 2026-11-22)

**Verdict: ready for spec.** All dimensions pass. The gaps found in the first draft were fixed in place
and are listed below.

| Dimension | Status | Note |
|---|---|---|
| Problem clarity | ✅ Pass | Section 2 names the failing conditions and the affected users (pipelines on `@afs/sdk`, console roles) |
| Scope definition | ✅ Pass | Goals and non-goals in section 3. Deferred items listed apart from findings in section 8 |
| Functional completeness | ✅ Pass | 21 atomic FRs, one per finding, each with file:line evidence. Every goal is covered |
| NFR coverage | ✅ Pass | Section 4 covers security, reliability, performance, observability, accessibility and quality (added during this review) |
| Acceptance criteria | ✅ Pass | Each FR names the test that must fail first and the observable outcome. Vague criteria in the draft ("handle errors properly") were replaced with role, request id and request-count assertions |
| Dependency identification | ✅ Pass | Section 5: `-restapi` catalog, platform Terraform for the CSP change, spec authority for FR-037 (added during this review) |
| Open questions | ✅ Pass | See below |

**Priority check (P0 = true blockers, not preferences).** No finding meets the P0 bar. None exposes a
secret value or token, none bypasses the API's authorization, and none blocks a core flow without a
workaround.

- FR-001 has a workaround: IdPs that issue refresh tokens are unaffected, and the others re-authenticate.
- FR-002 does not grant access: the API refuses. It hides the refusal.
- FR-006 needs an operator misconfiguration.

The P1s stay P1 because each one is a confirmed defect against a P0 requirement (WEB-2, WEB-3, WEB-8,
WEB-US-7), or a security hardening (FR-006). The review rules say security is never downgraded. Two
draft priorities changed:

- FR-011 (`waitFor` stale `Failed`): P1 → P2, because contract §1 makes the API return `Pending` on
  every mutation.
- FR-020 (link schemes): stays P2, because React 19 and the CSP already block `javascript:` URLs.

**Process guidance check.** Section 7 has TDD for each fix, a code and design review for each fix,
worker agent teammates, git worktrees, disjoint **Owns** per stream, and an explicit merge order with
the A, E, C, B, D dependencies stated.

**Open questions (to resolve while writing the fixes spec, not blocking):**

1. FR-001: does the platform accept `frame-ancestors 'self'` in place of `'none'`? If not, the fallback
   is a top-level `prompt=none` redirect that depends on FR-004 drafts. J or the platform owner decides.
   The interim is to apply `'self'` and record it in an ADR.
2. FR-005: should idle activity also count requests the user started, such as a download, or only
   input events? The interim is input events only, shared across tabs.
3. FR-004: which dialogs (as opposed to pages) must keep drafts? The minimum set is in the acceptance
   criteria. Others are optional.

**Strengths.** The evidence points to exact lines and checks that can be reproduced. The deferred items
are kept apart from the findings. The stream ownership follows the existing layer boundaries, so the
fixes cannot re-introduce dependency-rule violations without failing `architecture.test.ts`.

**Next step:** `/create-spec website-feature-complete-review-PRD.md` (step 8 of `implm-frm-prd`).
