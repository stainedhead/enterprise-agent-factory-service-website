# Spec: `-website` feature complete, code and design review fixes

| | |
|---|---|
| **Feature** | website-feature-complete-auto-review |
| **Spec** | `specs/261122-website-feature-complete-auto-review/` (created 2026-11-22 by `create-spec`, step 8 of `implm-frm-prd`) |
| **Branch** | `feat/website-feature-complete` (streams branch off it in worktrees) |
| **Reviewed spec** | `specs/archive/261121-website-feature-complete/` |
| **Source PRD** | [website-feature-complete-review-PRD.md](website-feature-complete-review-PRD.md) (sections 6 and 7 are authoritative for evidence and acceptance criteria) |
| **Scope** | `packages/sdk` (`@afs/sdk`) and `apps/console` (`@afs/console`). No other repository changes |

## 1. Executive summary

The step 5 review of `feat/website-feature-complete` found 21 issues (P0 0, P1 6, P2 15). The gate and the
fake-backed e2e suite cannot see them: session lifecycle without refresh tokens, `AccessDenied` from
mutations that bypass the mutation cache, dead draft persistence, cross-tab idle sign-out, plain-`http`
config values, and SDK retry, parse, redaction and wait edge cases. This spec fixes all of them in five
disjoint worker streams (A to E), merged in the order A, E, C, B, D.

## 2. Problem statement

See PRD section 2. Production behaviors that the fakes never exercise are broken or unproven, and a few SDK
paths do not follow SDK-6 and SDK-10 to the letter.

## 3. Goals and non-goals

**Goals.** (1) Every P1 is fixed with a failing test first. (2) Every P2 is fixed, or deferred with a written
reason in `implementation-notes.md`. (3) `bun run gate` stays green, `architecture.test.ts` is not weakened,
coverage on `domain` and `application` stays at 90% or more.

**Non-goals.** New features, screens or contract changes (contract gaps stay with `-restapi`, CQ-1..CQ-26);
changing oauth4webapi, TanStack Query or React Router, or the WD-31 design; visual redesign.
Task U-1 (contract re-pin, M6-U1) is carried here for tracking only. It is not a review finding and is
blocked on the `-restapi` merge and tag.

## 4. Functional requirements

One requirement per finding. Evidence and acceptance criteria (AC 1..n) are in the PRD section 6 under the
same id; they are not repeated here.

| Id | Pri | Requirement | Stream |
|---|---|---|---|
| FR-001 | P1 | CSP lets the console's own callback load in its own frame (`frame-ancestors 'self'`, `frame-src 'self' <issuers>`); e2e proves silent renewal with refresh tokens off; ADR and ASVS V3.7 row | B |
| FR-002 | P1 | `AccessDenied` from `useSecretMutation` and `useVersionedForm` reaches the shell alert and one `GetMe` refresh; the secret dialogs show the denial | C |
| FR-003 | P1 | An `unauthenticated` error from any query or mutation expires the session once; no retry storm | C (query layer), B (wiring) |
| FR-004 | P1 | Non-secret drafts are saved and restored across re-authentication; discarded on success, cancel and sign-out | D (hook, adoption), B (sign-out clears storage key) |
| FR-005 | P1 | Input activity is shared across tabs; idle sign-out only when no tab had input | B |
| FR-006 | P1 | `apiUrl`, `redirectUri`, `telemetryUrl` must be `https:` outside dev and e2e builds | B |
| FR-007 | P2 | SDK network-error retry follows the SDK-6 allow-list (method plus `Idempotency-Key`) | A |
| FR-008 | P2 | A non-JSON 2xx body rejects with `AfsError`, not `SyntaxError` | A |
| FR-009 | P2 | `409` maps to `Conflict`, `500` to `InternalError` explicitly | A |
| FR-010 | P2 | Short secret values are redacted (or refused before sending) | A |
| FR-011 | P2 | `waitFor` ends on `Failed`/`Degraded` only when `observedGeneration >= generation` | A |
| FR-012 | P2 | PKCE flows expire (10 min), are capped (5), removed on frame timeout; blocked storage gives a clear `AuthError` | B |
| FR-013 | P2 | A `login_required` callback keeps the return route | B |
| FR-014 | P2 | The session-expired dialog shows an alert on failure and re-enables | B |
| FR-015 | P2 | Queries do not retry `throttled`, `unavailable`, `network`; others at most one retry | C |
| FR-016 | P2 | `architecture.test.ts` matches dynamic imports and `export ... from`, and scans test files with a documented allow-list | E |
| FR-017 | P2 | Coverage excludes only type-only files under `application/ports/**`, guarded by a test | E |
| FR-018 | P2 | Biome reports 0 warnings and cannot regress | E (all but `IdentitySection.tsx`), D (that file) |
| FR-019 | P2 | Secondary queries (report tag keys, spend tag keys, ephemeral budget burn) show an inline error with request id and Retry | E |
| FR-020 | P2 | Adapters keep only `https:` URLs from API data (`prUrl`, `downloadUrl`) | E |
| FR-021 | P2 | ADR plus partial-failure test for T3's multi-mutation create (DV-28, CQ-14) | D |

## 5. Non-functional requirements

Security (no token or secret in storage, URL, React state, caches, logs or telemetry; sentinel e2e stays
green; CSP keeps `script-src 'self'`), reliability (a working tab keeps working), performance (no extra
request per poll cycle; retries bounded and honor `Retry-After`), observability (telemetry carries error
class, route template and request id only), accessibility (role `alert`/`dialog`, label, keyboard; axe
clean), quality (TDD red first per fix; gate green per commit; coverage thresholds on). Detail: PRD section 4.

## 6. System architecture

Affected layers: SDK core and resources (A); console `presentation/query`, `presentation/hooks`,
`presentation/shell` (C); `application/usecases/session`, `application/ports`, `infrastructure/auth`,
`infrastructure/storage`, `presentation/auth`, `main/`, `deploy/` (B); `presentation/hooks/useDraft` and
create screens (D); architecture and coverage config, secondary-query screens, two SDK adapters (E). See
`architecture.md`.

## 7. Scope of changes

Files each stream may touch are the **Owns** lines in `tasks.md`. No new dependencies. No change to
`packages/sdk/src/generated/**` or `packages/sdk/contract/**` (except task U-1).

## 8. Breaking changes

- `deploy/response-headers-policy.json`: `frame-ancestors 'none'` becomes `'self'`, and `frame-src` gains
  `'self'` (FR-001). The platform Terraform must pick up the new policy before the console relies on frame
  renewal. Departs from spec FR-037 of the archived spec (ADR-014).
- `config.json`: `http://` values are refused in production builds (FR-006).
- SDK: a secret value of any length is redacted or refused (FR-010). No public API change otherwise.

## 9. Acceptance criteria and quality gates

Per FR: PRD section 6. Overall: `bun run gate` green on every commit and after each merge; the Chromium e2e
subset for the merged stream (`e2e/specs/auth`, `quality`, `secrets`, `members` and touched screens);
`architecture.test.ts` green and not weakened; Biome 0 warnings; coverage on `domain` and `application` at
90% or more.

## 10. Risks and mitigation

| Risk | Mitigation |
|---|---|
| Platform rejects `frame-ancestors 'self'` | Interim: apply `'self'`, record in ADR-014. Fallback is a top-level `prompt=none` redirect that relies on FR-004 drafts; J or the platform owner decides |
| Stricter lint and architecture rules (E merges early) fail later streams | The failing stream fixes its own files (PRD 7.4) |
| Shared-file conflicts between parallel worktrees | Shared-file rules in `tasks.md` (disjoint hunks, single owner for wiring, ADR numbers pre-assigned) |
| `--error-on-warnings` breaks the gate before D fixes `IdentitySection.tsx` | E adds a scoped Biome override with a removal note; D-9 removes it (explicit exception in `tasks.md`) |

## 11. Timeline and milestones

Single milestone, five parallel streams. Merge order A, E, C, B, D, gate after each merge. Then step 10
(archive this spec into the archived original spec), step 11 (final quality pass, README and user-docs).

## 12. Open questions (from PRD section 9)

1. FR-001: does the platform accept `frame-ancestors 'self'`? Interim: apply and record in ADR-014.
2. FR-005: do user-started requests (downloads) count as activity? Interim: input events only, shared across tabs.
3. FR-004: dialogs beyond the minimum set may keep drafts (optional).

## 13. References

- Source PRD: [website-feature-complete-review-PRD.md](website-feature-complete-review-PRD.md)
- Reviewed spec: `specs/archive/261121-website-feature-complete/` (spec.md, tasks.md, implementation-notes.md WD, DV, CQ ids)
- `AGENTS.md` (this repository), `docs/architectural-decision-record.md`
