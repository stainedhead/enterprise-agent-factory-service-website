# Tasks: `-website` review fixes

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Date** | 2026-11-22 |
| **Status** | Planning complete; implementation not started |

## Progress summary

| Stream | Done | Total |
|---|---|---|
| A | 0 | 6 |
| E | 0 | 9 |
| C | 0 | 7 |
| B | 0 | 10 |
| D | 0 | 10 |
| U-1 | 0 | 1 |
| **All** | **0** | **43** |

## How to use this file

- **One worker per stream, one git worktree each**, on a branch off `feat/website-feature-complete`
  (`git worktree add ../w-rf-a -b rf/a`, likewise `rf/b` to `rf/e`). Streams run in parallel; the coordinator
  merges in the order **A, E, C, B, D** and runs `bun run gate` plus the Chromium e2e subset (`e2e/specs/auth`,
  `quality`, `secrets`, `members`, touched screens) after each merge.
- **Every task is TDD-sized:** write the named failing test first and check it fails for the stated reason,
  then the least code to pass, then refactor and rerun. Then a brief code and design review (AGENTS.md
  checklist). `bun run gate` green before each commit; commits reference this spec directory and the task id.
  Within a stream, P1 tasks come before P2 tasks.
- **Ownership is exclusive.** A stream creates and edits only the paths in its **Owns** line, plus new
  test files beside them. Needing a change in a file another stream owns means: wait for that stream's merge
  (if it is earlier in the merge order) or ask the coordinator. Never edit it. Paths are relative to
  `apps/console/` unless they start with `packages/`, `docs/` or `specs/`; `src/` is `apps/console/src/`.
- **AC** cites PRD section 6 acceptance criteria as `FR-nnn AC<n>`. Tick a box only when the task is
  green and reviewed. Update the stream's row and log in `status.md` after every task.

## Shared-file rules

| File or area | Rule |
|---|---|
| `package.json`, `apps/console/package.json`, `packages/sdk/package.json`, `bun.lock` | No stream adds, removes or bumps a dependency (none is needed). The only permitted edit is E-4: the root `package.json` `lint` script, nothing else. `bun.lock` is never edited by a stream; if a merge changes it, the coordinator regenerates it with `bun install` and commits it alone |
| `status.md` | Each stream edits only its own row under "Streams" and its own "Stream X log". The coordinator edits "Overall progress", "Merge log", U-1 and "Blockers". Do not reflow or sort lines |
| `implementation-notes.md` | Each stream appends only under its own "Stream X" heading (pre-created). The coordinator owns "Coordinator" and "Deferred findings" |
| `tasks.md` | A stream ticks only its own checkboxes (one line per task, so hunks stay disjoint). The coordinator ticks U-1 and the progress summary |
| Wiring and composition root: `src/main/main.tsx`, `src/main/wiring.ts`, `src/main/wiring.test.ts` | Owned by **B** only. C exposes options with safe defaults (for example `onUnauthenticated`), D reads the already-wired `AuthServices`. A stream that needs new wiring asks B (or the coordinator at B's merge) and does not edit these files |
| `docs/architectural-decision-record.md` | Append-only at the end. ADR numbers are pre-assigned: **ADR-014** is B's (FR-001), **ADR-015** is D's (FR-021). D rebases onto B's merge before adding its entry |
| `src/architecture.test.ts` allow-list | **E** only. A later stream that fails a new rule fixes its own files; it does not add allow-list entries |
| `e2e/fake-afs/**` | `idp.ts`, `idp.test.ts`, `serve.ts`: B. `server.ts` and the new `faults.ts` (request fault hook): C. `fixtures/overview.ts`: E. Other fixtures: nobody in this spec |
| `biome.json` | E only, with one exception: D-9 deletes the single scoped override that E-4 adds for `IdentitySection.tsx` |
| Archived spec `specs/archive/261121-website-feature-complete/implementation-notes.md` | Only B-3, and only the ASVS V3.7 row |
| `README.md`, `user-docs/`, `docs/` other than the ADR file | Coordinator, after the merges (step 11). `user-docs/` must not link into `specs/` |
| `src/presentation/routes/registry.tsx`, `src/presentation/search/sources.ts`, `e2e/visual/approvals.json` | No stream edits them. No new screen is added |

## Stream A: SDK

**Owns:** `packages/sdk/src/core/**` and `packages/sdk/src/resources/**` (tests included). Not
`packages/sdk/src/generated/**` or `packages/sdk/contract/**`.
**Findings:** FR-007, FR-008, FR-009, FR-010, FR-011. **Depends on:** nothing. **Merge position:** 1.

| Done | ID | Task | AC | Depends |
|---|---|---|---|---|
| [ ] | A-1 | Red: `transport.test.ts` cases with a synthetic POST `OperationDef` (`idempotent: false`) that gets exactly one attempt on a network error, a PATCH case, and a no-key `idempotency_in_progress` case. Green: compute retry eligibility in `client.ts` from the method and the presence of the `Idempotency-Key` header (GET, PUT, DELETE, keyed POST), including the `idempotency_in_progress` branch | FR-007 AC | none |
| [ ] | A-2 | Red: `transport.test.ts` cases for `200 text/html` and a truncated JSON body. Green: `client.ts` parse failure rejects with `AfsError` (`InternalError`, `status` the HTTP status, `requestId` from `X-Request-Id`, message with no body text over 200 characters) | FR-008 AC | none |
| [ ] | A-3 | Red: table-driven `errors.test.ts` over every mapped status plus one unmapped. Green: add `409 -> Conflict` and explicit `500 -> InternalError` to `STATUS_CODES`; `isConflict` true for a non-JSON 409 | FR-009 AC | none |
| [ ] | A-4 | Red: `hygiene.test.ts` case with a 1-character secret value that an error message echoes. Green: redact every non-empty secret field value (drop the `length > 3` filter) or refuse with a `TypeError` that does not contain the value; record the choice in the Stream A notes | FR-010 AC | none |
| [ ] | A-5 | Red: `wait.test.ts` stale-`Failed` and stale-`Degraded` cases (`observedGeneration < generation` keeps polling until the timeout). Green: `wait.ts` ends on `Failed`/`Degraded` only when `observedGeneration >= generation` | FR-011 AC | none |
| [ ] | A-6 | Stream exit: `bun run gate` (includes `size` and `tsdoc`), public surface unchanged, notes and `status.md` row updated, tasks ticked | Goal 3 | A-1..A-5 |

## Stream E: Quality and edges

**Owns:** `src/architecture.test.ts`, `vitest.config.ts`, `biome.json` (see the D-9 exception), root
`package.json` (`lint` script only), `src/application/usecases/config/ConfigUseCases.ts`,
`src/application/usecases/settings/SettingsUseCases.ts`, the test and testing files named in FR-018
(`src/application/usecases/identity/IdentityUseCases.test.ts`, `.../notifications/NotificationsUseCases.test.ts`,
`src/application/testing/identity.ts`, `src/application/testing/notifications.ts`,
`src/presentation/screens/s10-settings/SettingsPage.test.tsx`), `e2e/fake-afs/fixtures/overview.ts`,
`e2e/specs/shell/shell.spec.ts`, `src/presentation/screens/t11-reports/ReportSection.tsx`,
`src/presentation/screens/s9-cost-tags/SpendSection.tsx`, `src/presentation/screens/t1-overview/ephemeral/**`,
`src/presentation/screens/p6-work-order/**`, `src/presentation/screens/s11-export-import/**`,
`src/infrastructure/sdk/workOrders.ts`, `src/infrastructure/sdk/adminExports.ts` (+ their tests). Resolve the
exact paths of the FR-018 test and testing files with `bunx biome check .` at the start.
**Findings:** FR-016, FR-017, FR-018 (all but `IdentitySection.tsx`), FR-019, FR-020. **Depends on:** nothing.
**Merge position:** 2 (early, so the stricter rules gate later merges).

| Done | ID | Task | AC | Depends |
|---|---|---|---|---|
| [ ] | E-1 | Red: `architecture.test.ts` red-case fixtures for `import("x")` and `export ... from "x"` from `presentation` into `infrastructure/` and `@afs/sdk` (must be flagged). Green: extend `importsOf` | FR-016 AC1 | none |
| [ ] | E-2 | Red: stop skipping `*.test.ts(x)` and run; Green: add an explicit allow-list (for example `presentation` tests importing `application/errors.js`), every entry with a reason comment. Pre-existing violations in files this stream does not own go in the allow-list with a reason and a line in the Stream E notes; they are not edited | FR-016 AC2 | E-1 |
| [ ] | E-3 | Red: a test that fails when an excluded `application/ports/**` file has a runtime export. Green: narrow the `vitest.config.ts` exclusion to an explicit type-only list; `bun run test:cover` stays at 90% or more on `domain` and `application` | FR-017 AC | none |
| [ ] | E-4 | Clear the 11 Biome warnings in E's files (unused imports in `ConfigUseCases.ts` and `SettingsUseCases.ts`, `useOptionalChain` in `EphemeralCard.tsx`, and the unused variables, imports and `noCommaOperator` in the listed tests, testing files, fixture and spec). Add `--error-on-warnings` to the root `lint` script (or raise the rules to error in `biome.json`). Add one scoped `biome.json` override for `IdentitySection.tsx` with a comment "remove in D-9", so the gate stays green until D merges | FR-018 AC | E-1, E-3 (so edited files keep coverage) |
| [ ] | E-5 | Red: component test with a failing port for `ReportSection.tsx` tag keys (inline `Alert` with request id and Retry, separate from the empty state). Green: implement; Retry re-runs the query | FR-019 AC | none |
| [ ] | E-6 | Same for `SpendSection.tsx` tag keys | FR-019 AC | none |
| [ ] | E-7 | Same for `t1-overview/ephemeral/EphemeralCard.tsx` budget burn | FR-019 AC | E-4 (same file, `useOptionalChain` fix) |
| [ ] | E-8 | Red: adapter tests for `workOrders.ts` (`prUrl`) and `adminExports.ts` (`downloadUrl`) with `javascript:`, `data:`, `http:`, `https:`. Green: keep only `https:` (else `undefined`, rendered "—" in `p6-work-order` and `s11-export-import`) | FR-020 AC | none |
| [ ] | E-9 | Stream exit: `bun run gate`, `bunx biome check .` reports 0 warnings, `architecture.test.ts` red cases green, Chromium e2e for `shell` and the touched screens, notes and `status.md` updated | Goal 3, FR-018 AC | E-1..E-8 |

## Stream C: Error routing

**Owns:** `src/presentation/query/**`, `src/presentation/hooks/useSecretMutation.ts`,
`src/presentation/hooks/useVersionedForm.ts`, `src/presentation/shell/AccessDeniedProvider.tsx`,
`src/presentation/shell/ShellContext.tsx`, `src/presentation/screens/t4-secrets/**`,
`src/presentation/screens/t6-members/ApiKeysTab.tsx`, `src/presentation/screens/s10-settings/tabs/service-api-keys/**`,
`src/presentation/screens/t5-budget/**`, `e2e/specs/quality/secrets-sentinel.spec.ts`, and (new, only C)
`e2e/fake-afs/faults.ts` plus the single registration line in `e2e/fake-afs/server.ts`.
**Findings:** FR-002, FR-003 (query-layer part), FR-015. **Depends on:** nothing (E is merged first, so the
stricter rules apply). **Merge position:** 3.

| Done | ID | Task | AC | Depends |
|---|---|---|---|---|
| [ ] | C-1 | Red: tests that an `AccessDenied` from `useSecretMutation` and from `useVersionedForm` calls the shared reporter, and that the reporter receives only the `AppError` (never variables, never the secret). Green: export one reporter function from `presentation/query/` used by the query cache, the mutation cache and both hooks; it shows the shell alert with `requiredPermission` and request id and triggers one `GetMe` refresh | FR-002 AC1 | none |
| [ ] | C-2 | Red: component tests for create secret, rotate secret (`t4-secrets/SecretDialogs.tsx`), create API key (`t6-members/ApiKeysTab.tsx`) and the service API key dialog: a fake port returns `AccessDenied`; assert the alert (permission and request id), cleared secret input, dialog not closed as on success. Green: stop hiding the denial (`err && !err.isAccessDenied && ...` at `SecretDialogs.tsx` and `ApiKeysTab.tsx`) | FR-002 AC2 | C-1 |
| [ ] | C-3 | Red then green: the same denied-case test for the budget dialog (`t5-budget/EditBudgetDialog.tsx`, a `useVersionedForm` dialog) | FR-002 AC3 | C-1 |
| [ ] | C-4 | Add the fault hook `e2e/fake-afs/faults.ts` (for example `failNext(operationId, status, count)`) registered in `server.ts` with a unit test; extend `secrets-sentinel.spec.ts` with a denied create-secret and rotate-secret run proving no secret value reaches storage, URL, logs, the query or mutation cache, or the reporter | FR-002 AC1 | C-1, C-2 |
| [ ] | C-5 | Red: `createQueryClient` unit test: an `unauthenticated` `AppError` from a query, a cache mutation and each bypass hook calls `onUnauthenticated` exactly once, and no further request is sent for that query while it is expired (no retry storm). Green: add an `onUnauthenticated` option (default no-op) to `createQueryClient`, routed through the shared reporter. B wires it to `session.expire()` | FR-003 AC1, AC3 | C-1 |
| [ ] | C-6 | Red: a query test that counts requests per error kind against a fake port: `throttled`, `unavailable`, `network` are requested once; other retryable kinds at most twice in total. Green: change the retry predicate | FR-015 AC | none |
| [ ] | C-7 | Stream exit: `bun run gate`, Chromium e2e for `quality`, `secrets`, `members`; notes and `status.md` updated; tell the coordinator that `onUnauthenticated` and `faults.ts` are ready for B | Goal 3 | C-1..C-6 |

## Stream B: Session, auth and hosting

**Owns:** `src/application/usecases/session/**` (including `DraftStore.ts`), `src/application/ports/auth.ts`,
`src/application/ports/config.ts` (+ tests), `src/infrastructure/auth/**`, `src/infrastructure/storage/**`,
`src/infrastructure/config/**`, `src/presentation/auth/**` (including `AuthContext.tsx`),
`src/main/main.tsx`, `src/main/wiring.ts`, `src/main/wiring.test.ts`, `deploy/**`, `e2e/fake-afs/idp.ts`,
`e2e/fake-afs/idp.test.ts`, `e2e/fake-afs/serve.ts`, `e2e/specs/auth/**` (except `drafts.spec.ts`, which is D's),
`e2e/specs/quality/csp.spec.ts`, the ADR-014 entry in `docs/architectural-decision-record.md`, and the ASVS
V3.7 row in `specs/archive/261121-website-feature-complete/implementation-notes.md`.
**Findings:** FR-001, FR-003 (wiring), FR-005, FR-006, FR-012, FR-013, FR-014, FR-004 AC3 (sign-out clears the
draft key). **Depends on:** C for B-6. **Merge position:** 4.

| Done | ID | Task | AC | Depends |
|---|---|---|---|---|
| [ ] | B-1 | Red: `ports/config.test.ts` for `apiUrl`, `redirectUri` and `telemetryUrl` with `http://example.com` (refused, error names the field), `https://...` (accepted) and the dev and e2e exception. Green: `parseConfig` requires `https:` unless the build mode allows it (`localhost` for `vite dev` only); `main.tsx` passes the build mode | FR-006 AC1, AC2 | none |
| [ ] | B-2 | Red: update `deploy/build-output.test.ts` and `e2e/specs/quality/csp.spec.ts` to expect `frame-ancestors 'self'` and `frame-src 'self' <issuers>` (fail on the old values; `script-src 'self'` unchanged, no `unsafe-inline` or `unsafe-eval`). Green: edit `deploy/response-headers-policy.json` | FR-001 AC1 | none |
| [ ] | B-3 | Red: e2e `e2e/specs/auth/silent-renew.spec.ts` serves the build through the deploy headers with `setRefreshTokens(false)` (control exposed through `serve.ts`), lets the token reach `exp - 60 s`, expects renewal through the frame with no session-expired dialog and no CSP violation. Green: fix whatever the test exposes in B's files. Write ADR-014 (departure from archived spec FR-037, reason WD-30, platform Terraform note) and update the ASVS V3.7 row to name the test | FR-001 AC2, AC3 | B-2 |
| [ ] | B-4 | Red: new `IdleMonitor.test.ts` and `Session.test.ts` with a fake clock: input in tab A keeps tab B from signing out; no input anywhere signs out both; at most one `activity` message every 30 s; the channel accepts only `signout` and `activity`; `activity` carries no data. Green: throttled `activity` message on the session channel resetting every tab's monitor; wire in `main.tsx` | FR-005 AC1..AC3 | none |
| [ ] | B-5 | Red: `Session.test.ts` / `DraftStore` test that sign-out clears the `afs.drafts` sessionStorage key as well as memory. Green: add `DraftStore.clear()` (memory and key) and call it from `Session.signOut`. D owns the hook and the discard on submit and cancel | FR-004 AC3 (sign-out part) | none |
| [ ] | B-6 | Red: e2e `e2e/specs/auth/session-revoked.spec.ts`: using C's `faults.ts`, `ListAgents` answers `401` twice, the IdP renews, the session-expired dialog appears on the same route, secret inputs are empty, and no further `ListAgents` request is sent while the dialog is open. Green: in `main.tsx` pass `onUnauthenticated: () => session.expire()` to `createQueryClient` | FR-003 AC1..AC3 | C-5, C-4 (C merged) |
| [ ] | B-7 | Red: `SessionFlowStore` and `OidcClient` unit tests: flows carry a creation time; `put` drops flows older than 10 minutes and caps entries at 5; a renewal that times out removes its own flow; blocked `sessionStorage` raises `AuthError` saying browser storage is required for sign-in. Green: implement (`put` guarded with try/catch) | FR-012 AC1..AC3 | none |
| [ ] | B-8 | Red: unit test that `login-required` carries the flow's `returnTo`, and e2e `e2e/specs/auth/login-required.spec.ts` with two providers restoring the original route. Green: `OidcClient.complete`, `CompleteSignIn` and `presentation/auth/screens.tsx` pass `?returnTo=` through `safeReturnTo` | FR-013 AC | B-7 (same `OidcClient.ts`) |
| [ ] | B-9 | Red: component tests for the session-expired dialog: `listProviders.execute()` rejects, `reAuthenticate.execute()` rejects, no provider found. Green: each shows an `Alert` with role `alert` inside the dialog and re-enables *Sign in again* | FR-014 AC | none |
| [ ] | B-10 | Stream exit: `bun run gate`, Chromium e2e for `auth` and `quality`, notes (including the platform CSP follow-up) and `status.md` updated | Goal 3 | B-1..B-9 |

B-6 can only be built after C has merged into B's branch (`git merge rf/c` or rebase onto the integration
branch). All other B tasks start immediately.

## Stream D: Drafts

**Owns:** new `src/presentation/hooks/useDraft.ts` (+ test), `src/presentation/screens/t3-create-agent/**`,
`src/presentation/screens/s3-create-team/**`, `src/presentation/screens/p3-work-orders/CreateWorkOrderPage.tsx`,
`src/presentation/screens/p4-pools/CreatePoolPage.tsx`, new `e2e/specs/auth/drafts.spec.ts`, and the ADR-015
entry in `docs/architectural-decision-record.md`. **After C has merged** D also owns, for D-6 only, the
create-secret dialog in `src/presentation/screens/t4-secrets/SecretDialogs.tsx` and the create-API-key dialog
in `src/presentation/screens/t6-members/ApiKeysTab.tsx`. Exception: D-9 deletes the one `biome.json` override.
**Findings:** FR-004, FR-021, FR-018 (`IdentitySection.tsx`, which lives under `t3-create-agent/sections/`).
**Depends on:** B (session behavior, sign-out clearing, e2e) and C (dialog adoption). **Merge position:** 5.

| Done | ID | Task | AC | Depends |
|---|---|---|---|---|
| [ ] | D-1 | Red: `useDraft.test.tsx`: `useDraft(formId, initial)` reads and writes `AuthServices.drafts` for non-secret fields; passing a `SecretInput`-backed field is rejected by type (`@ts-expect-error` test) or by a runtime test. Green: implement the hook | FR-004 AC1 | none |
| [ ] | D-2 | Red: `CreateAgentPage.test.tsx` draft restored after remount, discarded on submit success and on cancel. Green: adopt `useDraft` in T3 *Create agent* (non-secret fields only) | FR-004 AC1, AC3 | D-1 |
| [ ] | D-3 | Same for S3 *Create team* (`CreateTeamPage.tsx`) | FR-004 AC1, AC3 | D-1 |
| [ ] | D-4 | Same for P3 *Create work order* and *Create pool* (`CreateWorkOrderPage.tsx`, `CreatePoolPage.tsx`) | FR-004 AC1, AC3 | D-1 |
| [ ] | D-5 | Red then green: discard on submit success and cancel is covered by a shared test helper for D-2..D-4 and D-6; no draft key remains in `sessionStorage` after cancel or success | FR-004 AC3 | D-2, D-3, D-4 |
| [ ] | D-6 | After C has merged: adopt `useDraft` for the non-secret fields of the *Create secret* and *Create API key* dialogs with component tests (non-secret restored, secret empty, `SecretInput` never drafted) | FR-004 AC1 | D-1, C merged |
| [ ] | D-7 | Red: e2e `e2e/specs/auth/drafts.spec.ts`: fill T3 with non-secret values and a secret value, force expiry, sign in again through the fake IdP, land on T3 with non-secret values restored and the secret empty; a storage scan shows no secret value in `sessionStorage` at any point; sign-out removes `afs.drafts`. Green: fix what it exposes in D's files | FR-004 AC2, AC3 | D-2, D-6, B merged (B-5) |
| [ ] | D-8 | Red: component or e2e test for T3 partial failure (one config value refused, agent created, refused value listed with the T7 link); add only if it does not exist. Green: fix if it fails. Write ADR-015: the exception to the spec's no-multi-mutation non-goal, the partial-failure behavior, removal trigger (CQ-14 resolved upstream). Rebase onto B's merge first | FR-021 AC | none |
| [ ] | D-9 | Remove the unused import in `t3-create-agent/sections/IdentitySection.tsx` and delete the scoped `biome.json` override that E-4 added; `bunx biome check .` shows 0 warnings | FR-018 AC | E merged |
| [ ] | D-10 | Stream exit: `bun run gate`, Chromium e2e for `auth`, `createAgent`, `secrets`, `members`, `teams`, `workOrders`, `pools`; notes and `status.md` updated | Goal 3 | D-1..D-9 |

## Stream-independent task

Owned by the coordinator, not by a stream. It touches `packages/sdk/contract/**`, `packages/sdk/src/generated/**`
and the generated fixtures, which no stream may edit, so it must not run in parallel with A.

| Done | ID | Task | AC | Depends |
|---|---|---|---|---|
| [ ] | U-1 | Carried from the archived spec (M6-U1, `specs/archive/261121-website-feature-complete/tasks.md`). Re-pin to the `-restapi` release tag (CQ-1) with `contract:update --ref <tag>`; regenerate; fix compile errors; drift tests green; remove the CQ-2 interim if `ApiKey.version` exists; confirm CQ-3; validate typed swarm template secrets in `parseSpec` and update fixtures (ADR-013); `@afs/sdk` `1.0.0` when the tag is v1. **Status: open, blocked on the `-restapi` merge to `main` and tag.** Not a review finding and not on the step 9 critical path | SDK-1, plan.md section 5 of the archived spec | CQ-1 (external) |

## Traceability: finding to tasks

| FR | Pri | Stream | Tasks |
|---|---|---|---|
| FR-001 | P1 | B | B-2, B-3 |
| FR-002 | P1 | C | C-1, C-2, C-3, C-4 |
| FR-003 | P1 | C, B | C-5, B-6 |
| FR-004 | P1 | D, B | D-1..D-7, B-5 |
| FR-005 | P1 | B | B-4 |
| FR-006 | P1 | B | B-1 |
| FR-007 | P2 | A | A-1 |
| FR-008 | P2 | A | A-2 |
| FR-009 | P2 | A | A-3 |
| FR-010 | P2 | A | A-4 |
| FR-011 | P2 | A | A-5 |
| FR-012 | P2 | B | B-7 |
| FR-013 | P2 | B | B-8 |
| FR-014 | P2 | B | B-9 |
| FR-015 | P2 | C | C-6 |
| FR-016 | P2 | E | E-1, E-2 |
| FR-017 | P2 | E | E-3 |
| FR-018 | P2 | E, D | E-4, D-9 |
| FR-019 | P2 | E | E-5, E-6, E-7 |
| FR-020 | P2 | E | E-8 |
| FR-021 | P2 | D | D-8 |
