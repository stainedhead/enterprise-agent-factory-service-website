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

## Stream B (session, auth, hosting)

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

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
