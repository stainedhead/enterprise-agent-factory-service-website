# Architecture: website-feature-complete-auto-review

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Date** | 2026-11-22 |
| **Status** | Draft |

## 1. Architecture overview

No new component and no new layer. The fixes change behavior inside the existing structure described in the
archived spec's `architecture.md` and in `AGENTS.md`: `presentation` to `application` to `domain`,
`infrastructure` to `application`, and only `main/` importing `infrastructure`. `architecture.test.ts`
(strengthened by FR-016) keeps enforcing that.

## 2. Component architecture and layer responsibilities

| Concern | Layer and path | Change |
|---|---|---|
| Retry, parse, error map, redaction, wait | `packages/sdk/src/core`, `src/resources` | Stream A |
| One `AccessDenied` reporter, `onUnauthenticated` hook, retry predicate | `presentation/query` | Stream C |
| Bypass hooks route errors to the reporter | `presentation/hooks/useSecretMutation.ts`, `useVersionedForm.ts` | Stream C |
| Session expiry on `401`, cross-tab activity, draft clearing | `application/usecases/session`, `main/main.tsx` | Stream B |
| PKCE flow store, `login_required` return route | `infrastructure/storage`, `infrastructure/auth` | Stream B |
| Config validation | `application/ports/config.ts`, `main/main.tsx` | Stream B |
| CSP policy | `deploy/response-headers-policy.json` | Stream B |
| Draft hook | `presentation/hooks/useDraft.ts` over `AuthServices.drafts` | Stream D |
| Dependency-rule scan, coverage rule, lint rule | `architecture.test.ts`, `vitest.config.ts`, `biome.json` | Stream E |
| Scheme check at the edge | `infrastructure/sdk/workOrders.ts`, `adminExports.ts` | Stream E |

## 3. Data flow

**Errors (FR-002, FR-003).** query or mutation error, or a bypass-hook error, goes to `reportAppError`.
`AccessDenied` raises the shell alert (permission, request id) and one `GetMe` refresh. `unauthenticated`
calls `onUnauthenticated` once, which `main.tsx` wires to `session.expire()`; the dialog shows and queries
stop requesting.

**Drafts (FR-004).** form field changes go to `useDraft`, which writes `AuthServices.drafts`.
`ReAuthenticate` persists the snapshot to `sessionStorage` (`afs.drafts`) before the redirect; the page reads
it back after sign-in. Submit success, cancel and sign-out remove it. `SecretInput` values never enter it.

**Idle (FR-005).** input in any tab resets its monitor and posts a throttled `activity` message; other tabs'
monitors reset on receipt. Idle sign-out fires only when no tab had input.

**Silent renewal (FR-001).** the hidden frame loads the IdP, which redirects to `/auth/callback` inside the
frame. With `frame-ancestors 'self'` and `frame-src 'self' <issuers>` the browser renders it, and the frame
posts the result to the parent.

## 4. Sequence of the 401 path

```
API 401 -> SDK refresh -> IdP renews -> API 401 again
  -> AppError(unauthenticated) -> reportAppError -> onUnauthenticated -> session.expire()
  -> "Your session has expired" dialog (route and non-secret drafts kept, secret inputs cleared)
```

## 5. Integration points

Platform Terraform consumes `deploy/response-headers-policy.json` (FR-001). `-restapi` supplies the
`permissions.json` catalog; this spec does not change `domain/permission.ts`. The e2e fakes (`idp.ts`,
new `faults.ts`) are test-only.

## 6. Architectural decisions

| Id | Decision | Where |
|---|---|---|
| ADR-014 (B) | `frame-ancestors 'self'` replaces `'none'` so frame renewal works; departs from archived spec FR-037 (WD-30) | `docs/architectural-decision-record.md` |
| ADR-015 (D) | T3 create is a recorded exception to the no-multi-mutation rule (DV-28); partial-failure behavior; removal when CQ-14 is resolved | same |
| Decision | one reporter function in `presentation/query/` rather than per-hook handling | this spec, implementation-notes (Stream C) |
| Decision | `onUnauthenticated` is an option with a no-op default so `main.tsx` stays the only composition root | this spec |

## 7. Stream isolation

Streams own disjoint paths (see `tasks.md`). The seams between streams are interfaces, not shared files:
C exposes `onUnauthenticated` and `faults.ts`; B consumes them. B exposes `DraftStore.clear` and the session
behavior; D consumes them. E's rules apply to everyone after E merges.
