# Dev-Flow Process Analysis

**Feature:** website-feature-complete
**Spec directory:** specs/archive/261121-website-feature-complete
**Report generated:** 2026-11-22

---

## 1. Executive Summary

The website repository gained its full product: `@afs/sdk` (typed client generated from the pinned `-restapi`
contract, 182 operations in 41 resource modules, retries, `If-Match`, `Idempotency-Key`, pagination, `waitFor`,
typed reports) and the `@afs/console` web console (every screen of the PRD by role, OIDC code and PKCE sign-in with
in-memory tokens, role-aware controls, secret handling that never stores a value, CLI preview on create forms).
A step 5 review found 21 issues (P0 0, P1 6, P2 15); five parallel streams fixed all of them, and U-1 re-pinned the
contract to `-restapi` `main` at `d887609`.

**Total runtime:** 2026-11-21T22:13:33Z (first flow commit `c76e1b2`) to 2026-11-22T12:15:48Z (last commit before
this report), 14 h 02 min wall clock. The dashboard records the process start as 21:56:49Z, 17 min before the first
commit. Of the wall clock, 4 h 12 min were gaps with no commit (see section 2) and 1 h 33 min (10:42 to 12:15)
were spent waiting for the `-restapi` merge that U-1 depended on.
**Overall assessment:** the progressive documentation flow held up. Every milestone ended with a green gate and a
dashboard update, review fixes were disjoint enough to merge with conflicts only in status rows and the ADR file,
and the review step found real defects that the gate and the fake-backed e2e suite could not see.

---

## 2. Step-by-Step Timing

Times from `git log` (author dates, UTC). The dashboard's own start and end values agree with them except where
noted.

| Step | Name | Start | End | Runtime (min) | Key Outputs |
|---|---|---|---|---|---|
| 1 | Create spec from PRD | 21:56:49 (dashboard) | 22:13:33 (`c76e1b2`) | 17 | spec directory, PRD moved in |
| 2 | Review spec | 22:13:33 | 22:15:16 (`e5cbcc3`) | 2 | gaps fixed |
| 3 | Implement product (M0 to M6) | 23:27:15 (`4da885d`, M0 first commit) | 09:47:40 (`48f6a93`) | 620 incl. gaps | 57 commits, 258 of 259 tasks, SDK 0.3.0 |
| 4 | Documentation and user docs | 09:47:40 | 09:50:56 (`cdc14f7`) | 3 | docs, README, user-docs |
| 5 | Code and design review | 09:51:33 | 10:01:58 (`a9961ab`) | 10 | 21 findings |
| 6 | Prepare review PRD | 10:01:58 | 10:02:25 (`e6bb6d1`) | 1 | PRD ready for spec |
| 7 | Archive original spec | 10:02:25 | 10:06:32 | 4 | spec moved to `specs/archive/` |
| 8 | Spec review fixes | 10:06:32 | 10:07:51 (`82d9515`) | 1 | review spec, 5 streams, 43 tasks |
| 9 | Implement review fixes | 10:09:26 (`9fbdd04`) | 10:42:23 (`a2dff6f`) | 33 | streams A to E merged, gate and e2e green |
| 10 | Archive fixes spec | after `-restapi` merged (U-1 unblocked) | 12:15 | n/a | U-1 done (`d887609`), review spec nested |
| 11 | Final quality pass | same session | 12:2x | n/a | gate green, 259 Chromium e2e passed |
| 12 | Process analysis report | same session | this commit | n/a | this file |
| 13 | Archive spec | same session | this commit | n/a | layout confirmed |
| 14 | Open pull request | same session | after push | n/a | PR into `main` |

Steps 10 to 14 have no separate start timestamps on the dashboard because they ran back to back in one session
after the external wait; git shows U-1 at 12:15:48Z (`feat(sdk,console): re-pin contract...`) and the later
commits only.

**Notable observations:**
- Commit timestamps are not uniform: there is no commit between 01:43:54Z (`ae10020`, M2) and 04:29:19Z (`2aa2f37`,
  M2), 2 h 45 min, and a further 1 h 27 min between 08:10:07Z (`b05bde2`) and 09:47:40Z (`48f6a93`). Git is
  authoritative, but these gaps are pauses in the session, not 165 minutes of coding. Step 3's 620 min therefore
  overstates effort; the commits themselves show about 8 h of dense work (M0 to M1 in 1 h 45 min, M3 to M6 in
  about 3 h 30 min).
- Step 9 was the shortest high-value step: 33 min for 42 tasks through five parallel streams.
- The flow could not finish on its own. U-1 (contract re-pin) depended on `-restapi` merging, so step 3 stayed "In
  Progress" and the task was carried into the review spec; this cost the flow a pause of about 1 h 33 min.

---

## 3. Commit and Push Summary

**Total commits:** 86 from `c76e1b2` (step 1) to the commit that precedes this report, 97 in the repository
including the scaffold. The full list with timestamps is `git log c76e1b2^..HEAD`. Key commits:

| Commit | Timestamp | Message |
|---|---|---|
| `c76e1b2` | 2026-11-21T22:13:33Z | spec: create website-feature-complete spec from the PRD (step 1) |
| `e5cbcc3` | 2026-11-21T22:15:16Z | spec: review spec and fix gaps (step 2) |
| `4da885d` | 2026-11-21T23:27:15Z | M0-S1..S5 deps, contract snapshot and lock, gate/CI |
| `6af171a` | 2026-11-22T01:11:41Z | M1 exit, `@afs/sdk` 0.2.0 |
| `af95f2c` | 2026-11-22T05:34:30Z | M3 exit, contract re-pin, `@afs/sdk` 0.3.0 |
| `3e6cd93` | 2026-11-22T06:40:40Z | M4 exit, contract re-pin |
| `2edae69` | 2026-11-22T07:19:14Z | M5 integration, contract re-pin |
| `48f6a93` | 2026-11-22T09:47:40Z | feature complete, no placeholders remain (M6-X1) |
| `a9961ab` | 2026-11-22T10:01:58Z | code and design review PRD (step 5) |
| `82d9515` | 2026-11-22T10:07:51Z | archive spec, create review fixes spec (steps 7 and 8) |
| `983f353`..`a7df9cf` | 2026-11-22T10:31Z | merge streams A, E, C, B, D |
| `a2dff6f` | 2026-11-22T10:42:23Z | integrate review-fix streams, wire session expiry, draft secret dialogs |
| `4732794` | 2026-11-22T12:15:48Z | re-pin contract to `-restapi` main `d887609`, typed template secrets (U-1) |

**Pull requests:** one PR from `feat/website-feature-complete` into `main` (number in the PR itself).

Size of the change from the first flow commit: 829 files and 96,333 insertions outside `specs/`; 19 spec files and
4,434 insertions inside it.

---

## 4. Spec vs. Implementation Comparison

The spec states scope and milestones rather than time estimates, so the comparison is of scope, not minutes.

| Phase | Planned (spec) | Actual (git log) | Difference | Notes |
|---|---|---|---|---|
| Research and spec | steps 1 and 2 | 19 min | n/a | one commit each |
| Architecture and planning | in the spec | in step 1 | n/a | |
| Implementation M0 to M6 | 6 milestones, 259 tasks | 258 closed in step 3, M6-U1 closed in U-1 | M6-U1 deferred then closed | blocked externally (CQ-1) |
| Testing | TDD per task, gate per milestone | gate green at every milestone exit | none | 259 Chromium e2e at the end |
| Review and fixes | steps 5 to 9 | 21 findings, 43 tasks, 33 min | n/a | |

**Phases skipped:** none.
**Phases added:** U-1 re-pin as a stream-independent task; wiring of session expiry and secret-dialog drafts done by
the integrator after the merges (B-6, D-6, D-9, D-10).

---

## 5. Token / Message Usage

Exact token counts are unavailable. Estimate by step complexity: the orchestrator ran one turn per step plus gate
and merge handling; step 3 ran one worker per milestone group in parallel; step 9 ran five workers (A to E), one
worktree each, plus an integrator. The U-1 and closing steps ran in one further session.

---

## 6. Process Observations

### What worked well
- Parallel worktree streams with a shared-files ownership table (tasks.md) produced conflicts only in status rows
  and the ADR file, resolved by keeping both sides.
- Milestone exits (gate, e2e, contract re-pin) caught drift early; the pin moved four times without a late surprise.
- The review step found session, error-routing, draft and SDK edge defects the gate cannot see.
- Test-first tasks: the template secrets validation in U-1 went red (eight cases) before green.

### What caused delays or rework
- The `-restapi` merge gated U-1, so step 3 could not close and the dashboard carried an "open item" across steps 7
  to 9.
- Archived paths changed twice (original spec in step 7, review spec in step 10); references to
  `specs/261122-...` in dashboards, notes and one source comment had to be rewritten.
- A flag `STREAM_C_MERGED` and a `SEAM` skip in an e2e test were needed to let stream B land before stream C.
  Removing them after the merge was extra work.
- The upstream contract had no release tag, so the pin is a commit hash; `@afs/sdk` 1.0.0 still waits.

### Recommendations for future runs
- Sequence cross-repo dependencies before the flow starts, or split the carried task out of step 3 so the
  orchestrator can close it.
- Record a start timestamp on the dashboard for every step, including steps 10 to 14.
- Have the integrator pre-assign the wiring that two streams need so no skip flag is required.
- Ask the upstream repository to tag releases, so the pin is a tag and `@afs/sdk` can be 1.0.0.

---

## 7. Manual vs. Automated Comparison

**Estimated manual duration:** about 8 to 10 weeks for one senior developer (SDK with code generation, a console of
the PRD screens by role, a fake API and IdP, about 260 e2e tests and visual baselines, a review pass and fixes).
Assumes familiarity with the stack and excludes meetings and product review.
**Actual automated runtime:** 14 h 02 min wall clock from the first flow commit to the last, about 8 h of it
dense commit activity (section 2).
**Efficiency gain:** roughly 10x to 15x on wall clock, with the caveat that human review of the PR, the 33 pending
visual baselines and the first SDK publish are still ahead.

The comparison basis is a rough estimate of effort for the delivered line count and test volume, not a measurement.
