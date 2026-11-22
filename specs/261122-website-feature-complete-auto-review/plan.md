# Plan: website-feature-complete-auto-review

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Date** | 2026-11-22 |
| **Status** | Planning |

## 1. Development approach

TDD per finding (red, green, refactor), a brief code and design review before each commit, `bun run gate`
green per commit, commits referencing `specs/261122-website-feature-complete-auto-review/` and the task id.
P1 before P2 within a stream. Each stream is a parallel worker in its own git worktree off
`feat/website-feature-complete`; the coordinator merges and gates.

## 2. Phase breakdown

| Phase | Content |
|---|---|
| Setup | Coordinator creates worktrees `../w-rf-a` to `../w-rf-e` (branches `rf/a` to `rf/e`) from the head of `feat/website-feature-complete` |
| Parallel work | A (6 tasks), E (9), C (7), B (10; B-6 waits for C), D (10; D-6 waits for C, D-7 for B) |
| Merge | A, then E, C, B, D. After each merge: `bun run gate` and the stream's Chromium e2e subset |
| Close | Step 10 archive this spec inside the archived original; step 11 README, `user-docs/`, `docs/`, coverage; deferred items recorded |

## 3. Critical path

C-1 to C-5 (reporter, hook) then B-6 (wiring plus e2e); B-5 then D-7 (drafts e2e). D is the longest chain:
C and B must be merged before D-6 and D-7. A, E and the independent B tasks (B-1 to B-4, B-7 to B-9) are off
the critical path.

## 4. Merge order and rationale

1. A: independent; can merge at any time.
2. E: early, so the stricter lint and `architecture.test.ts` rules gate every later merge.
3. C: adds the shared reporter, `onUnauthenticated` and `faults.ts`.
4. B: wires `onUnauthenticated` to `session.expire()` (needs C).
5. D: last (needs B's session behavior for its e2e, C for dialog adoption).

Conflict policy: ownership is disjoint; shared files follow the rules in `tasks.md`. On a textual conflict in
`status.md`, `implementation-notes.md` or `tasks.md`, keep both sides.

## 5. Testing strategy

Unit and component tests with fake ports and a fake `fetch`; Chromium e2e on the fake API and fake IdP
(`auth`, `quality`, `secrets`, `members`, touched screens); sentinel e2e extended for secret paths; coverage at
90% or more on `domain` and `application` (E-3 widens what counts); axe clean for new alerts and dialogs.
Firefox and WebKit run in CI only.

## 6. Rollout strategy

Merged through the existing PR of `feat/website-feature-complete` (step 14). FR-001 needs the platform
Terraform to apply the new response headers policy before the console relies on frame renewal.

## 7. Deferred and external items

U-1 (contract re-pin) is open and blocked on the `-restapi` merge and tag. Firefox and WebKit e2e run in CI.
33 visual baseline approvals are pending for J. CQ-2..CQ-26 stay with `-restapi` and root.

## 8. Success metrics

21 of 21 findings fixed or deferred with a written reason; gate green; Biome 0 warnings; `architecture.test.ts`
stricter than before; coverage at or above 90% on `domain` and `application`; no secret value or token in
storage, URL, logs or telemetry (sentinel e2e green).
