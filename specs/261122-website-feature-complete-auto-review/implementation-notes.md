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

## Deferred findings

(none yet; a deferral needs a written reason here)

## Lessons learned
