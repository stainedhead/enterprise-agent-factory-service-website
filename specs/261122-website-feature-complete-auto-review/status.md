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
| A: SDK | FR-007..FR-011 | 6/6 | no | Gate green on wf/a |
| E: Quality and edges | FR-016..FR-020 | 9/9 | no | Branch `wf/e`; gate green |
| C: Error routing | FR-002, FR-003 (query layer), FR-015 | 7/7 | no | Gate green; `onUnauthenticated` and `faults.ts` ready for B |
| B: Session, auth, hosting | FR-001, FR-003 (wiring), FR-005, FR-006, FR-012..FR-014, FR-004 (sign-out) | 9/10 | no | B-6 is not ticked: spec and SEAM are written, verified red and green in a scratch merge with C; waits for C's merge |
| D: Drafts | FR-004, FR-021, FR-018 (`IdentitySection.tsx`) | 0/10 | no | |
| U-1 (stream-independent) | M6-U1 contract re-pin | 0/1 | n/a | Open: blocked on the `-restapi` merge and tag (CQ-1) |

## Merge log

(coordinator: one line per merge with the commit and the gate result)

## Stream A log

- 2026-11-22: A-1..A-5 done test-first (FR-007..FR-011); A-6 stream exit: gate green, public surface unchanged. Decisions in implementation-notes.md "Stream A".

## Stream B log

- B-1 (FR-006) done: `parseConfig` requires https, loopback http only in dev and e2e builds.
- B-2, B-3 (FR-001) done: CSP `'self'` for `frame-src` and `frame-ancestors`; `silent-renew.spec.ts`; ADR-014; ASVS V3.7.
- B-4 (FR-005) done: shared activity across tabs, typed session channel.
- B-5 (FR-004 sign-out) done: `afs.drafts` cleared on sign-out.
- B-7, B-8, B-9 (FR-012, FR-013, FR-014) done.
- B-10 done: `bun run gate` green; Chromium e2e `auth` and `quality` 25 passed, 2 skipped (B-6, seam).
- B-6 (FR-003 wiring): spec and SEAM written, waiting for stream C's merge (see implementation notes RF-B8).

## Stream C log

- 2026-11-22: C-1, C-2, C-3, C-5, C-6 done (reporter, dialogs, `onUnauthenticated`, retry predicate); C-4 done (`faults.ts`, denied-secret sentinel e2e).
- 2026-11-22: C-7 exit: `bun run gate` green; Chromium e2e `quality`, `secrets`, `members` 28 passed, 1 failed (`quality/csp.spec.ts` "every screen runs under the deploy headers", B's FR-001 area, not touched here).

## Stream D log

## Stream E log

- 2026-11-22: E-1, E-2 architecture rule covers dynamic imports, re-exports and test files (13 allow-list entries).
- 2026-11-22: E-3 coverage excludes 34 type-only port files; `auth.ts`, `config.ts`, `preferences.ts` now counted.
- 2026-11-22: E-4 Biome at 0 warnings; `lint` runs `--error-on-warnings`; scoped override for `IdentitySection.tsx`.
- 2026-11-22: E-5..E-7 inline error, request id and Retry for report tag keys, spend tag keys, ephemeral budget burn.
- 2026-11-22: E-8 `https:`-only `prUrl` and `downloadUrl`. E-9 `bun run gate` green (sdk 275, console 1268 tests); Chromium e2e green: shell, tags, adminExports, ephemeral, workOrders, reports, overview (68 tests).

## Blockers

- U-1 waits for `-restapi` `feat/restapi-feature-complete` to merge to `main` and be tagged (CQ-1, DV-62).

## Recent activity

- 2026-11-22: spec created from the review PRD (step 8).
