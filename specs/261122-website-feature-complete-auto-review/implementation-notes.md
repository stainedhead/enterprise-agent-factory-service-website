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
