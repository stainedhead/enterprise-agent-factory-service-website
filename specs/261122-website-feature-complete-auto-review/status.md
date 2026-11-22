# Status: website-feature-complete-auto-review

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Created** | 2026-11-22 |
| **Spec** | `specs/261122-website-feature-complete-auto-review/` |
| **Branch** | `feat/website-feature-complete` |
| **Dashboard** | `specs/archive/261121-website-feature-complete/website-feature-complete-status.md` |

**MANDATORY:** update this file after every task and every phase.

**Edit rule (parallel worktrees).** A stream edits only its own row in "Streams" and its own "Stream X log"
section below. The coordinator edits "Overall progress", "Merge log" and the U-1 row. Never reformat other
lines, so merges stay hunk-disjoint.

## Overall progress

| Phase | Name | Status | Notes |
|---|---|---|---|
| 0 | Initial research (review PRD) | Complete | PRD reviewed in step 6 (ready for spec) |
| 1 | Specification (`spec.md`) | Complete | Created in step 8 |
| 2 | Research and data modeling | Complete | research.md, data-dictionary.md |
| 3 | Architecture and planning | Complete | architecture.md, plan.md |
| 4 | Task breakdown | Complete | tasks.md: 5 streams, 42 tasks plus U-1 |
| 5 | Implementation (step 9) | Not Started | |
| 6 | Completion and archival | Not Started | Step 10 archives this spec inside the original archive |

## Streams

| Stream | Findings | Tasks done | Merged | Notes |
|---|---|---|---|---|
| A: SDK | FR-007..FR-011 | 0/6 | no | |
| E: Quality and edges | FR-016..FR-020 | 0/9 | no | |
| C: Error routing | FR-002, FR-003 (query layer), FR-015 | 0/7 | no | |
| B: Session, auth, hosting | FR-001, FR-003 (wiring), FR-005, FR-006, FR-012..FR-014, FR-004 (sign-out) | 9/10 | no | B-6 is not ticked: spec and SEAM are written, verified red and green in a scratch merge with C; waits for C's merge |
| D: Drafts | FR-004, FR-021, FR-018 (`IdentitySection.tsx`) | 0/10 | no | |
| U-1 (stream-independent) | M6-U1 contract re-pin | 0/1 | n/a | Open: blocked on the `-restapi` merge and tag (CQ-1) |

## Merge log

(coordinator: one line per merge with the commit and the gate result)

## Stream A log

## Stream B log

- B-1 (FR-006) done: `parseConfig` requires https, loopback http only in dev and e2e builds.
- B-2, B-3 (FR-001) done: CSP `'self'` for `frame-src` and `frame-ancestors`; `silent-renew.spec.ts`; ADR-014; ASVS V3.7.
- B-4 (FR-005) done: shared activity across tabs, typed session channel.
- B-5 (FR-004 sign-out) done: `afs.drafts` cleared on sign-out.
- B-7, B-8, B-9 (FR-012, FR-013, FR-014) done.
- B-10 done: `bun run gate` green; Chromium e2e `auth` and `quality` 25 passed, 2 skipped (B-6, seam).
- B-6 (FR-003 wiring): spec and SEAM written, waiting for stream C's merge (see implementation notes RF-B8).

## Stream C log

## Stream D log

## Stream E log

## Blockers

- U-1 waits for `-restapi` `feat/restapi-feature-complete` to merge to `main` and be tagged (CQ-1, DV-62).

## Recent activity

- 2026-11-22: spec created from the review PRD (step 8).
