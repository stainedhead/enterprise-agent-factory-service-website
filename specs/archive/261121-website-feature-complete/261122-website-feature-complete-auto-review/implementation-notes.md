# Implementation notes: website-feature-complete-auto-review

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Date** | 2026-11-22 |

Decisions, edge cases, deviations and lessons learned while fixing the review findings. Id scheme:
`RF-<stream letter><n>` for decisions, `RM-<n>` for minor findings found during a per-fix review (each minor
finding also becomes a task in `tasks.md` if not fixed at once).

**Edit rule (parallel worktrees).** Each stream appends only under its own heading below. The coordinator
owns the "Coordinator" section. Do not edit another stream's section.

## Coordinator

- Interim decisions for the PRD's open questions (PRD section 9): FR-001 apply `'self'` and record in ADR-014;
  FR-005 input events only, shared across tabs; FR-004 minimum dialog set only.
- ADR numbers are pre-assigned: B writes ADR-014 (FR-001), D writes ADR-015 (FR-021).
- **Integration (step 9).** Merged `--no-ff` in order A, E, C, B, D. Conflicts were only the summary rows in
  `tasks.md` and `status.md` (kept the row with progress) and the ADR file (ADR-014 then ADR-015). B-6 done:
  `main.tsx` passes `onUnauthenticated: () => session.expire()`; the skip flag in `session-revoked.spec.ts` is
  removed (not flipped), so the spec always runs. D-6 done on the merged tree. D-9 done: E's `IdentitySection.tsx`
  override deleted, `bunx biome check .` 0 warnings. `user-docs/configuration.md` shows B's CSP and says the CDN
  must not send `X-Frame-Options: DENY` (use `SAMEORIGIN`).

## Stream A (SDK)

- **RF-A1 (FR-007).** Network-error retry and the `idempotency_in_progress` retry now share one predicate in
  `client.ts`, `isRetryable(method, headers)`: GET, PUT, DELETE, or POST carrying an `Idempotency-Key`
  header. PATCH and a POST without a key get one attempt. 429 and 503 retries are unchanged (the server
  refused the request, so it did not run). Tests use synthetic `OperationDef`s registered on the
  `operations` table for the duration of the suite.
- **RF-A2 (FR-008).** A 2xx body that is not JSON rejects with `AfsError` (`InternalError`, `status` the HTTP
  status, `requestId` from the response metadata, fixed message with no body text). The old
  `ct.includes("text/")` pass-through is removed: only `def.yaml` or a `yaml` content type returns text, so a
  `200 text/html` proxy page on a JSON operation is refused instead of returned as a string. CSV does not go
  through `call`.
- **RF-A3 (FR-009).** `409 -> Conflict` and `500 -> InternalError` added to `STATUS_CODES`.
- **RF-A4 (FR-010).** Chose redaction over refusal: every non-empty secret field value is scrubbed from error
  messages and details (the `length > 3` filter is gone). A short value may over-redact a message, which is
  the safe direction; refusing would break legitimate short secrets. Empty strings are skipped.
- **RF-A5 (FR-011).** `waitFor` ends on `Failed`/`Degraded` only when `observedGeneration >= generation`; a
  stale one keeps polling until the timeout (the `WaitError` then reports `timeout` with the last status).
- Public surface unchanged. No dependency, generated file or contract change.

## Stream B (session, auth, hosting)

- **RF-B1 (FR-006).** `parseConfig(raw, { allowLoopbackHttp })`: `https:` is required for `apiUrl`, `redirectUri`
  and `telemetryUrl`; `http:` is accepted only for a loopback host (`localhost`, `127.0.0.1`, `[::1]`) and only
  when `main.tsx` passes `allowLoopbackHttp = __AFS_E2E__ || import.meta.env.DEV` (the dev server and the e2e
  build; a production build compiles it to `false`). The error text now says "must be an https URL" and names the
  field. Provider `issuerUrl` is unchanged: the OIDC client already refuses `http` outside the e2e build.
  The checked-in `public/config.json` (`http://localhost`) is therefore valid only under `vite dev`; a production
  deployment replaces it (it already must).
- **RF-B2 (FR-001).** CSP is `frame-src 'self' <issuers>` and `frame-ancestors 'self'` (ADR-014). The platform
  Terraform and any CDN rule that adds `X-Frame-Options: DENY` must follow (use `SAMEORIGIN`): follow-up for the
  platform, and `user-docs/configuration.md` line 46 still shows the old policy (coordinator, step 11).
  `e2e/specs/auth/silent-renew.spec.ts` was red before the policy change (renewal never completed) and green
  after, with no change needed in the console code.
- **RF-B3 (FR-005).** The session channel is typed `SessionMessage = "signout" | "activity"`;
  `BroadcastSessionChannel` delivers only those two bare strings. `IdleMonitor` takes the channel: input posts
  `activity` at most once per 30 s (`ACTIVITY_THROTTLE_MS`), a received `activity` resets the timer without
  re-broadcasting, and `stop()` unsubscribes. Trade-off: a remote reset can lag the real input by up to 30 s, so
  a tab may sign out up to 30 s before the configured idle time (minimum 5 minutes, so at most 10 %).
- **RF-B4 (FR-004 AC3, sign-out part).** `DraftPersistPort.clear()` and `SessionDraftStorage.clear()` remove the
  `afs.drafts` key. `DraftStore` takes the persistence port and `clear()` drops memory and the key. `Session`
  gets `deps.drafts` and clears it in the signed-out transition (local sign-out and a `signout` from another
  tab), never on expiry, so `main.tsx` no longer needs its own `onChange` hook. D owns the hook and discards.
  Note for D: the renewal frame runs the whole console under `/auth/callback`, and `Boot` calls
  `persisted.take()` there; a draft written for a re-authentication redirect is only consumed after the
  redirect, so this is harmless, but do not write drafts to `afs.drafts` outside `ReAuthenticate`.
- **RF-B5 (FR-012).** `PendingFlow.createdAt` is set by `OidcClient` (injectable `now`). `SessionFlowStore.put`
  prunes against the new flow's own clock: unreadable or older-than-10-minutes entries go, then the oldest so
  that at most 5 remain, and any storage failure becomes `AuthError("storage", "Browser storage is required for
  sign-in...")`. `FlowStore.discard(state)` is new; `renewInFrame` discards its own flow in `finally`. The
  sign-in page and the session-expired dialog show the storage message instead of "could not be reached".
- **RF-B6 (FR-013).** `AuthError.returnTo` carries the flow's route on `interaction_required`;
  `CompleteSignIn` returns `{ kind: "login-required", returnTo }`; `CallbackPage` navigates to
  `/sign-in?returnTo=<route>` (through `safeReturnTo`, bare `/sign-in` for `/`).
- **RF-B7 (FR-014).** The dialog keeps its state in a `problem` string: discovery failure, re-authentication
  failure and "no provider" show an `Alert` (role `alert`) inside the dialog and re-enable *Sign in again*; a
  new attempt clears the alert.
- **RF-B8 (B-6 seam, FR-003 wiring).** C is not in this branch. `e2e/specs/auth/session-revoked.spec.ts` is
  written against C's `faults.ts` (armed through `POST /__inject`, same payload as C's sentinel spec) and is
  skipped by `STREAM_C_MERGED = false`. `main.tsx` carries a SEAM comment with the exact replacement for the
  `createQueryClient` line. I verified both in a scratch worktree that merged `wf/c` (see the Stream B log).
  Integrator: after merging C, apply that one edit, flip the constant, run the spec.
- **E2E isolation (lesson).** The e2e servers use fixed ports (4173, 4400, 4401). Parallel worktrees share the
  host, so a second worker's `reuseExistingServer` silently ran my specs against another worktree's build. I ran
  every e2e in a private network namespace (`unshare -n`, loopback brought up with an ioctl) so the ports are
  mine alone. The coordinator should do the same, or give each worker its own `E2E_WEB_PORT`, `FAKE_AFS_PORT`
  and `FAKE_IDP_PORT` (several specs hardcode `127.0.0.1:4173` in their sentinel origin lists, so the
  namespace is simpler).

## Stream C (error routing)

- **RF-C1 One reporter per query client.** `presentation/query/errorReporter.ts` keeps a `WeakMap` from
  `QueryClient` to the reporter `createQueryClient` builds; `useErrorReporter()` reads the client from
  `QueryClientContext` (not `useQueryClient`, which throws), so `useSecretMutation` and `useVersionedForm`
  still work outside a provider (no-op). The query cache, mutation cache and both hooks call that one function.
  It receives the error only, never the variables or a secret (tested with a sentinel value).
- **RF-C2 Denial shown in the dialog too.** The shell alert sits behind the modal overlay, so the new
  `query/DeniedAlert.tsx` renders the same facts (the permission and the request id) inside the create and
  rotate secret, create API key, service API key and edit budget dialogs. The earlier `err && !err.isAccessDenied`
  hiding is gone. `useVersionedForm` reports every `AppError` from `save` and `reload`.
- **RF-C3 `onUnauthenticated`.** Third argument `options` of `createQueryClient` (default no-op). It fires once
  per client (a latch on `GlobalStatus.sessionExpired`, outside the render snapshot). On the first `401` the
  client cancels in-flight queries and `defaultQueryOptions` resolves every observer to `enabled: false`, even
  an explicit `enabled: true`, so no invalidate, refetch, poll or newly mounted query reaches the API while
  the session is expired. There is no un-latch: re-authentication is a top-level redirect (a full reload).
  No app code uses `fetchQuery`.
- **RF-C4 Retries.** Queries never retry `throttled`, `unavailable` or `network` (the SDK did), nor the
  kinds that cannot change; every other kind gets one retry (two requests in total).
- **RF-C5 Fault hook.** `e2e/fake-afs/faults.ts` (`Faults.failNext(operationId, status, count, {requiredPermission})`)
  plus four small edits in `server.ts` (import, a `faults` field, `inject()` accepting a fault payload so the
  existing `/__inject` control channel can arm it, `clearInjections()` clearing faults, one early return in
  `handle`). A fault payload is `{operationId, status, times, requiredPermission?}`; `control.ts` and `serve.ts`
  are not C's, so the sentinel spec posts to `/__inject` itself.
- **RM-C2** `quality/csp.spec.ts` (B's) fails its all-screens case in this sandbox at the first `page.goto` (`ERR_ABORTED`); the C changes do not touch it. Left to B (FR-001, B-2/B-3).
- **RM-C1** `secrets-sentinel.spec.ts` hard-coded origin port 4173; it now reads `E2E_WEB_PORT` so parallel
  worktrees can run it on their own ports.
- Existing T5 test "a forced 403 is shown" asserted the raw API message; it now asserts the permission and
  request id (FR-002 AC3).

## Stream D (drafts)

- **RF-D1 Hook shape.** `useDraft(formId, initial)` (`presentation/hooks/useDraft.ts`) returns `{ value, setValue,
  restored, discard }`. A draft is one JSON string under the key `json` of the session `DraftStore` (the store
  and the `afs.drafts` carrier keep their `Record<string, Record<string, string>>` shape, so B's `DraftStore`
  work is unaffected). Saved synchronously in `setValue`; a restored draft is merged over `initial`, so a field
  the form gained later keeps its default; corrupt or foreign data is ignored.
- **RF-D2 Secrets are refused twice.** Type: `Draftable<T>` maps any function-bearing value (a `SecretInput`
  handle, a callback) to `never`, so passing one is a compile error (`@ts-expect-error` test). Run time:
  `assertDraftable` throws a `TypeError` (message without any value) for non-plain data and for secret-named keys
  (`secret`, `secretValue`, `password`, `token`, `apiKey`, ...). Secret values stay in `SecretInput` refs.
- **RF-D3 No auth context.** Without `AuthContext` (screen tests that do not wire it) the hook is plain state
  and persists nothing; `main/` always provides it. Tests use `withDrafts` / `expectNoDraftLeft`
  (`hooks/useDraft.testing.tsx`), the shared D-5 helper.
- **RF-D4 What is drafted.** All non-secret form state of T3, S3, P3 create and P4 create, including config rows
  (names, sources, literal values: configuration is non-secret by API design) and secret *bindings* (secret ids
  and targets, never values). Form ids: `t3-create-agent:<teamId>`, `s3-create-team`, `p3-create-work-order`,
  `p4-create-pool:<teamId>`. T3 and P4 are keyed by team so a draft never crosses teams. A restored draft turns
  off the template/model prefill (it would overwrite the person's choices). The S3 wizard step is not drafted.
- **RF-D5 Discard.** On create success and on Cancel only; a refused create keeps the draft. T3 discards even
  when config values were refused (the agent exists; the fix is in T7, ADR-015).
- **RF-D6 FR-021.** The partial-failure behavior already worked; a component test now pins it (list, T7 link, no
  second create, no navigation). ADR-015 appended at the end of `docs/architectural-decision-record.md`.
- **RM-D1 D-7 scope.** T3 has no secret input, so the e2e proves the non-secret round trip, no token in any
  storage write, the carrier key removed after restore and after sign-out. The typed-secret half (dialogs) goes
  with D-6.
- **RD-6 Dialogs (integrator).** Create secret (`t4-create-secret:<teamId>`: scope, name, description, system,
  rotation) and Create API key (`t6-create-api-key:<teamId>`: name, role, days) use `useDraft`; the secret value
  stays in `SecretInput`, the new key is never in state. Discard on success and on Cancel or close; a refused
  create keeps the draft. Covered by `SecretDialogs.drafts.test.tsx` and `ApiKeysTab.drafts.test.tsx` (a sentinel
  value never appears in the store). Rotate secret has no non-secret field, so it is not drafted.

## Stream E (quality and edges)

- **RF-E1 (FR-016).** `importsOf` now strips comments and matches `from "x"` (import and re-export, multi-line
  included), bare `import "x"` and `import("x")`. `architecture.test.ts` itself is the only file the dependency scan
  skips (it holds violating snippets as strings). Browser-API rules still skip test files (not in FR-016).
- **RF-E2 (FR-016 AC2).** Scanning tests found 13 pre-existing violations, all `application/usecases/**/*.test.ts`
  importing in-memory fakes from `presentation/testing/*` (pure fakes, no React). They are in `TEST_ALLOW_LIST`
  with a reason; a test fails on a stale entry. Not edited (files not owned). Follow-up: move those fakes to
  `application/testing/`.
- **RF-E3 (FR-017).** `vitest.config.ts` excludes an explicit list of 34 type-only port files. New guard
  `src/application/ports/coverage-exclusion.test.ts` fails on a glob, a missing file or an excluded file with a
  runtime export. `auth.ts`, `config.ts`, `preferences.ts` (runtime exports) now count; coverage stays above 90%.
  A new type-only port file is covered (0 statements) until added to the list; that is harmless.
- **RF-E4 (FR-018).** Fixed the 11 warnings in E's files (unused ones deleted, not underscored). Root `lint` is
  `biome check --error-on-warnings .`. `biome.json` does not accept comments, so the "remove in D-9" note for the
  `IdentitySection.tsx` override (`noUnusedImports: off`) lives here and in the tasks.md shared-file rules: D-9 deletes the unused
  `FormField` import and the override together.
- **RF-E5 (FR-019).** `SecondaryQueryAlert` (exported from `t11-reports/ReportSection.tsx`, reused by
  `SpendSection` and `EphemeralCard`) shows an error `Alert` with message, request id and Retry (`refetch`); an
  API access denial shows nothing (the API's answer, handled globally, as in `ReportPanel`). `useTagKeys` now
  returns `{ keys, error, retry }`. The ephemeral budget row reads "Unavailable" instead of "Loading…" on failure.
- **RF-E6 (FR-020).** New `infrastructure/sdk/safeUrl.ts` (`httpsUrlOrUndefined`) used by `workOrders.ts` and
  `adminExports.ts`. In `ExportsCard.tsx`, a succeeded export with no link and no past expiry renders "—" rather
  than "Expired" (`downloadState` in `application` is not owned and still returns `expired`).

## U-1 Contract re-pin (M6-U1)

- **Pin.** `-restapi` `main` at `d8876092759b4025327607d5d7295f93e80c23ed` (PR #4, "restapi feature complete").
  There is no release tag yet, so the pin is the merge commit on `main` (a commit on `main` replaces the moving
  feature branch of ADR-013). Done with `contract:update --ref <sha>`, then `codegen`; `contract.lock.json` records
  the source, ref, commit and sha256 of the three files. Contract version still reads 1.1.0. CQ-1 and DV-62 are
  closed for the website: the SDK no longer pins a feature branch. Moving to a `v*` tag, and `@afs/sdk` 1.0.0, wait
  for `-restapi` to tag.
- **Diff against `549a2f2`.** (1) `SwarmTemplateSpec.secrets` is typed `{pool, name, description?, delivery?
  (env|file), target?}` with `pool` and `name` required, max 100 entries. This is the only generated-code change
  (`src/generated/schemas.ts`). (2) `UpdateWorkOrderRepo` description: a workload principal may omit `If-Match`.
  The SDK keeps auto-reading the version for human callers, so no behavior change. (3) `/readyz` failing checks
  report only `unavailable` (description and example). (4) Two `operations.json` notes (notification test
  `202 pending`, restore `RestoreResult`). No path, operationId, parameter or permission changed.
- **Console (TDD).** `parseSpec` now validates template secrets: `pool` and `name` required, pool defined in the
  template, name pattern, unique names, delivery env or file, target pattern per delivery and unique per pool,
  description length, at most 100. Eight red cases first, then green. The e2e swarm template fixture and the
  `summarise` test use typed secrets; the spec editor hint names pool and name.
- **Permissions.** `permissions.json` is byte-identical to `-restapi` `api/contract/permissions.json` at the pin;
  the 58 permission names equal the constants in `internal/authz/catalog_gen.go`, and `-restapi`'s
  `TestCatalogEqualsContract` holds catalog and grants equal to that file. No drift.
- **CQ-2** stays open: `ApiKey` still has no `version`, so the `If-Match: "1"` interim stays. **CQ-3** is
  confirmed: `IfMatchPut` reads "Required when the resource exists (428 otherwise); omit when the PUT creates it".

- **Baselines regenerated on the CI image (DV).** The committed chromium baselines were made with this sandbox's
  fonts and differed from the GitHub runner by 2 to 3% of pixels (tolerance stays 0.5%). The `e2e` job now runs in
  `mcr.microsoft.com/playwright:v1.63.0-noble`, and a head commit containing `[regen-baselines]` makes it run the
  chromium `visual:` specs with `--update-snapshots` and commit only the snapshot PNGs back (GITHUB_TOKEN,
  `contents: write`; bot pushes do not trigger workflows, so no loop). Done once (bot commit `1734171`). Baselines
  remain `pending` in `e2e/visual/approvals.json` until the owner approves them against the mockups.

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
