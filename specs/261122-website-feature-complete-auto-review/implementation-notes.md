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

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
