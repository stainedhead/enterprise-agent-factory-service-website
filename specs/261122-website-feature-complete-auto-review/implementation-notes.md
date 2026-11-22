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

## Stream E (quality and edges)

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
