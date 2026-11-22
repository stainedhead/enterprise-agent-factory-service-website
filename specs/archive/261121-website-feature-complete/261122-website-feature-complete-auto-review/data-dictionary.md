# Data dictionary: website-feature-complete-auto-review

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Date** | 2026-11-22 |

Purpose: the types, messages and storage keys this fix set adds or changes. Nothing else in the existing
dictionary of the archived spec changes. Names marked (proposed) may be adjusted by the owning stream; record
the final name in that stream's notes.

## Entities and value objects

| Name | Layer | Change | Finding |
|---|---|---|---|
| `Flow` (PKCE flow record: verifier, nonce, provider, `returnTo`) | infrastructure/auth | adds `createdAt` (epoch ms); expiry 10 min, cap 5 entries | FR-012 |
| `login-required` outcome of `CompleteSignIn` | application/usecases/session | carries `returnTo` | FR-013 |
| `Draft` (formId to non-secret field map) | application/usecases/session `DraftStore` | gains `clear()` (memory and the `afs.drafts` key) | FR-004 |

## Interfaces and options

| Name | Layer | Definition | Finding |
|---|---|---|---|
| `onUnauthenticated: () => void` (proposed) | presentation/query `createQueryClient` option | default no-op; called once per expiry; B passes `() => session.expire()` | FR-003 |
| `reportAppError(error: AppError)` (proposed) | presentation/query | the single reporter for caches and both bypass hooks; receives the error only, never variables | FR-002 |
| `useDraft(formId, initial)` (proposed) | presentation/hooks | returns non-secret field values and setters backed by `AuthServices.drafts`; secret fields are rejected by type or test | FR-004 |
| `parseConfig(raw, options)` | application/ports/config | `options` carries the build mode (production, dev, e2e) so `http:` is allowed only in dev and e2e | FR-006 |
| `faults.failNext(operationId, status, count)` (proposed) | e2e/fake-afs | request fault hook | FR-002, FR-003 |
| `OperationDef.idempotent`, `Idempotency-Key` header | SDK core | retry eligibility = method in (GET, PUT, DELETE) or POST with the header | FR-007 |

## Enumerations and status maps

| Name | Change | Finding |
|---|---|---|
| SDK `STATUS_CODES` (`errors.ts`) | adds `409 -> Conflict`, explicit `500 -> InternalError` | FR-009 |
| `AppError` kinds (console) | query retry: no retry for `throttled`, `unavailable`, `network`, plus existing exclusions; others at most one retry | FR-015 |

## Channel messages (BroadcastChannel on the session channel)

| Message | Data | Rate | Finding |
|---|---|---|---|
| `signout` | none | on sign-out | existing |
| `activity` | none | at most one per 30 s per tab | FR-005 |

Any other message is ignored.

## Storage keys

| Key | Store | Content | Change |
|---|---|---|---|
| `afs.flow.<state>` | sessionStorage | PKCE flow (no tokens) | expiry, cap, removal on frame timeout (FR-012) |
| `afs.drafts` | sessionStorage | non-secret drafts only | now written by `useDraft`; cleared on sign-out (FR-004) |

No other key. No secret value or token is ever stored.

## Configuration

`config.json` fields `apiUrl`, `redirectUri`, `telemetryUrl`: `https:` required outside dev and e2e (FR-006).
`deploy/response-headers-policy.json`: `frame-ancestors 'self'`, `frame-src 'self' <issuers>` (FR-001).

## Errors

`AfsError` for a non-JSON 2xx: `code` `InternalError`, `status` the HTTP status, `requestId` from
`X-Request-Id`, message with at most 200 characters of body text (FR-008). `AuthError` for blocked storage:
message states that browser storage is required for sign-in (FR-012).
