# Plan: `-website` feature complete

| | |
|---|---|
| **Feature** | website-feature-complete |
| **Date** | 2026-11-21 |
| **Status** | Planning (step 1) |

## 1. Development approach

- **Milestone agents in order, M0 → M6.** Each runs its milestone's streams in parallel git worktrees
  (branches `wt/<milestone>-<stream>` off `feat/website-feature-complete`), merges them in the listed order,
  runs the exit task, and only then does the next milestone start. Only the milestone agent ticks
  `tasks.md` and updates `status.md` and the dashboard.
- **TDD per task.** Red (the task's AC tests fail for the right reason), green, refactor; `bun run gate`
  green before each commit. Commits reference `specs/261121-website-feature-complete` and the task ids.
- **Generated before hand-written.** The SDK is generated from the pinned snapshot; screens never call
  the SDK, only use cases; use cases are tested with in-memory fake ports, SDK adapters with a fake
  `fetch`, screens with component tests on fake use cases, and flows with Playwright on the fake API.
- **Contract-first changes.** A needed field or operation that the snapshot lacks is never invented in the
  SDK: it is logged as a contract question in implementation-notes.md and raised with `-restapi`.

## 2. Phase breakdown

| Milestone | Streams (tasks.md) | Depends on | Output |
|---|---|---|---|
| M0 Foundations | S (serial first) → G, C, D, A, U, E, W in parallel → P, H after their inputs | snapshot in repo | SDK core + generated client; domain; sign-in; shell; UI kit; fake API harness; hosting config |
| M1 Teams & access | Q, L, K, Y first wave; T, O, M, D, N, H second wave | M0 | S1–S3, T1, V1, T6, S10 (settings, IdPs), T15 (audit, revisions) |
| M2 Agents & secrets | A, C, S, V, E, F, G | M1 | T2–T4, T7, T9, T10, S7, V2, S10 storage classes + agent templates |
| M3 Spend control | K, C first; B, P, R, N | M2 | SDK reports; T5, S4, S8, T11, T12, T14 notifications |
| M4 Production readiness | A, W, G, I, L, E, S, N | M3 | S5, S6, S9, T8 + identities, T13, T14 logs, S11, schedules, restore, S10 channels |
| M5 Budgeted workloads | E, P, G, T | M4 | P2, P4, guardrails, kubeconfig, cost tag status |
| M6 CVE remediation | O, W, T, K first; Q, U last | M5 | P3, P5, P6, security operator shell, S10 keys + operators, sweep, re-pin |

## 3. Critical path

`M0-S2 snapshot` → `M0-G codegen` → `M0-C core` → `M0-P packaging` → `M0-D me/can` → `M0-H shell` →
`M1-Q query layer` → every screen stream. The UI kit (M0-U) and the fake API (M0-E) run beside the SDK
work and must land before M0-H and the first screen e2e. Within M1, `M1-T` (teams) is the longest stream
(S2 + S3 wizard); start it first in the second wave.

## 4. Testing strategy

| Level | Tool | Scope | Never |
|---|---|---|---|
| SDK unit | Vitest (Node 22), same suite under `bun --bun vitest` and Vitest browser mode (Chromium) | core, generated modules, extras; fake `fetch` returning `Response` objects; fake clock and random | a real API or network |
| SDK contract | Vitest | coverage of 182 methods; replay of the 170 OpenAPI response examples through the SDK; permission fixture checksum | |
| Console domain / application | Vitest | `can()` per role allowed + denied, catalog drift vs `contract/permissions.json`, status, poll policy, navigation, money, CLI builder; use cases on fake ports; ≥ 90% coverage | React, SDK |
| Console infrastructure | Vitest | SDK adapters on a fake `fetch` (through the real SDK), OIDC on a fake IdP in-process, config loader, telemetry | a real IdP |
| Console presentation | Vitest + Testing Library + happy-dom + axe-core | components and screens on fake use cases; role variants; disabled reasons | |
| E2E | Playwright (Chromium; Firefox and WebKit smoke) on `e2e/fake-afs` | Given/When/Then flows, token storage checks, sentinel secret checks, polling counts, no-mutation viewer sessions | the dev environment (only `e2e:dev`, opt-in) |
| Visual | Playwright snapshots, 1440 × 900 @2× | one per screen, mockup fixture data | |
| Accessibility | `@axe-core/playwright` per screen, keyboard-only flow specs | | |
| Budgets | `size:sdk`, `size:console` (gzip) | NFR-1, NFR-2 | |

Fake-API fixtures are validated against the pinned OpenAPI at load, so an e2e test can never pass against
a shape the real API cannot return.

## 5. Contract snapshot and sync

1. **Pin now (M0-S2).** Copy `api/openapi.yaml`, `api/contract/permissions.json` and
   `api/contract/operations.json` from `-restapi` `feat/restapi-feature-complete` at `747a484` into
   `packages/sdk/contract/`; write `contract.lock.json` (data-dictionary §1). `contract:check` is the first
   step of `bun run gate`.
2. **Never edit the snapshot by hand.** `contract:update --ref <tag|commit>` fetches the three files from
   GitHub, rewrites the lock, runs `codegen`, and prints the operation and schema diff (added, removed,
   changed) for the commit message.
3. **Re-pin points.** At each `-restapi` milestone exit that changes `api/openapi.yaml` (checked by the
   milestone agent at its own exit task by comparing the lock's sha256 with `-restapi`'s current file), and
   mandatorily **when `-restapi` merges `feat/restapi-feature-complete` to `main` and tags a release**:
   task M6-U1 re-pins to that tag (`ref` becomes the tag), regenerates, fixes compile errors, updates the
   permission drift fixture, and closes CQ-2/CQ-3 if resolved. If the tag lands earlier, the milestone
   agent then running does M6-U1's re-pin step at its exit and M6-U1 only verifies.
4. **Drift in CI.** `codegen:check` fails when `src/generated/` is not what the snapshot produces; the
   permission drift test fails when `domain/permission.ts` differs from `contract/permissions.json`.
5. **Announce.** A re-pin that changes the public surface bumps `@afs/sdk` (minor for additive, major for
   breaking, per SDK rules) and is noted in `docs/technical-details.md`.

## 6. Rollout strategy

- The console is one immutable build artifact promoted dev → stage → prod; per-environment differences are
  only in `config.json` (D43). The repository provides the headers policy and cache behaviours
  (`apps/console/deploy/`); the platform Terraform deploys them.
- `@afs/sdk` is published as `0.1.0` after M0 (core + full generated surface), then a minor per milestone
  that adds extras (`waitFor` M1, reports M3) and at every re-pin; `1.0.0` when `-restapi` tags v1 and M6
  completes.
- Feature exposure follows the API: a screen whose operations return `404 NotFound` for an unknown route
  (not yet deployed server-side) shows the not-found page; no client feature flags.

## 7. Success metrics

- 182/182 SDK methods; 0 drift (coverage test, `codegen:check`, permission drift test).
- 182/182 story criteria cited by tasks and proven by tests; 33/33 screens with axe clean and a visual
  baseline; approvals tracked in `e2e/visual/approvals.json`.
- SDK core ≤ 25 KB gzip, every resource module ≤ 3 KB gzip; console initial route ≤ 300 KB gzip.
- `domain` and `application` coverage ≥ 90%.
- Sentinel e2e: 0 occurrences of a secret value, `secretKey` or token outside the allowed places.
