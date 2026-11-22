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

## Stream C (error routing)

## Stream D (drafts)

## Stream E (quality and edges)

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
