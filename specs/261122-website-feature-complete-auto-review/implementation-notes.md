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

## Stream D (drafts)

## Stream E (quality and edges)

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
