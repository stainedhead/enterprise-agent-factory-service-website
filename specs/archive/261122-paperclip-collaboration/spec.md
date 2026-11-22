# Spec: Paperclip team collaboration (website)

Source PRD: `specs/261122-paperclip-collaboration/paperclip-collaboration-PRD.md` (extract of the living PRD, which keeps the full requirement text, stories and decisions; this spec restates what is built and how it is proven).

## Executive Summary

Each AFS team can have one collaboration agent that runs Paperclip (board, chat and roster). The REST API and its contract (v1.3.1) exist; this repository adds the typed client (`@afs/sdk`) and the screens: a team-admin creates the collaboration agent from T3, manages its public web UI and REST API on T16, connects the team's worker agents to it and sees its Paperclip-managed secrets; viewers and the new team collaborator role see the read-only page V3; service admins govern the guardrail per team and the service-wide `collab.*` settings on S10. The SDK is built and versioned first (1.0.1), then the console milestones C1 to C4.

## Problem Statement

The console and SDK know nothing of Paperclip. Team-admins cannot create the collaboration agent, switch its public surfaces or connect agents; viewers and collaborators cannot find it or learn what they may do; service admins cannot allow or forbid it; the SDK has no typed calls.

## Goals / Non-Goals

Goals WG1 to WG5 (PRD §1.1). Non-goals: no Paperclip content, iframe, proxy or call to a team hostname; no Paperclip key field; no role change after create; no hostname choice; bulk connect is the only client-side multi-call workflow (WP-D5).

## Functional Requirements

| FR | PRD | Summary |
|---|---|---|
| FR-001 | SDK-12 | `collaboration` resource (get, put, links.list, connectAgent, disconnectAgent, rotateKeys) and `admin.collaborationEndpoints.list` |
| FR-002 | SDK-13 | Fields on agents, teams, secrets, agent templates, swarm templates, identity providers, roles and the `collaboration` report kind |
| FR-003 | SDK-14 | `collaboration.endpointUrl(teamId)` |
| FR-004 | SDK-15 | `isSecretDetected`, exported reason constants, nullable URLs |
| FR-005 | SDK-16 | Contract resync to v1.3.1 |
| FR-006 | WEB-23 | T16 collaboration page: status, switches with confirmation, actions, CLI panel, empty state, polling |
| FR-007 | WEB-24 | V3 read-only variant with the team-admin banner |
| FR-008 | WEB-25 | Connected agents panel with bulk connect and disconnect |
| FR-009 | WEB-26 | Managed secrets and recent access panels |
| FR-010 | WEB-27 | T3 role step |
| FR-011 | WEB-28 | T1/V1 tile, T2 badge and column, navigation item |
| FR-012 | WEB-29 | Managed secrets on T4/V2 |
| FR-013 | WEB-30 | Permission mirror and the `team_collaborator` role, teal header pill |
| FR-014 | WEB-31 | Members and API keys role pickers |
| FR-015 | WEB-32 | Team guardrail on S2/S3 |
| FR-016 | WEB-33 | S10 Collaboration tab, seven settings, endpoint list |
| FR-017 | WEB-34 | S10 identity provider collaboration client, template capabilities |
| FR-018 | WEB-35 | Collaboration report kind in T11 and S8 |
| FR-019 | WEB-36 | Rotate keys, managed mode, unmanaged-agents alert, guidance |
| FR-020 | WEB-37 | Swarm template collaboration agent |
| FR-021 | WEB-US-60/61 | Fake API additions, baselines, axe, sentinel, CSP |

## Non-Functional Requirements

PRD §7 Paperclip rows: T16 is a lazy route chunk (<= 40 KB gzip) and the initial route stays <= 300 KB; each SDK resource <= 3 KB gzip; no Paperclip key or content in state, URL, storage, logs or telemetry; an older API (no `collaboration:*` permission) shows no collaboration UI; WCAG 2.2 AA; domain and application >= 90% coverage.

## System Architecture

SDK: generated resources (`collaboration`, `admin.collaborationEndpoints`) plus hand-written `src/resources/collaboration.ts` (`createCollaboration`, `endpointUrl`) and `src/core/reasons.ts`. Console: `domain/collaboration.ts`, `application/ports/collaboration.ts`, `application/usecases/collaboration/`, `infrastructure/sdk/collaboration.ts`, `presentation/screens/t16-collaboration/` (lazy). See architecture.md.

## Scope of Changes

`packages/sdk` (contract pin, codegen, resources, errors, reasons, tests), `apps/console` (domain, ports, use cases, adapters, screens, fake API, e2e, baselines), docs, README, CHANGELOG, versions 1.0.1.

## Breaking Changes

None for SDK consumers: the additions are additive; `ReportKind` and `ErrorCode` widen. The pinned contract moves from 1.1.0 to 1.3.1.

## Success and Acceptance Criteria

Every story's criteria in the PRD, proven by the tests it names; `bun run gate` green; baselines regenerated; axe clean on the changed screens.

## Risks and Mitigation

| Risk | Mitigation |
|---|---|
| Contract pinned to an unmerged `-restapi` commit | Pin the exact sha; follow-up to re-pin to the merge commit; `contract:check` guards drift |
| Every team-scoped baseline changes (nav item) | One reviewed change with `[regen-baselines]` |
| Size of the work | Milestones C1-SDK to C4, a commit and push after each |

## Timeline and Milestones

C1-SDK, C1, C2, C3, C4 (PRD §10.1). Release 1.0.1.

## References

- `specs/261122-paperclip-collaboration/paperclip-collaboration-PRD.md`
- Living PRD: `specs/archive/261121-website-feature-complete/enterprise-agent-factory-service-website-PRD.md`

## Components affected (files)

- `packages/sdk`: `contract/*` (pin), `src/generated/**` (regenerated), `src/core/errors.ts`, `src/core/reasons.ts`, `src/resources/collaboration.ts`, `src/resources/reports.ts`, `src/index.ts`, tests and `package.json` (1.0.1).
- `apps/console/src/domain`: `permission.ts`, `me.ts`, `navigation.ts`, `screens.ts`, `routes.ts`, new `collaboration.ts`, `generated/cliOperations.ts`.
- `apps/console/src/application`: new `ports/collaboration.ts`, `usecases/collaboration/`; changes to agents-create, secrets, members, settings, teams, reports, swarm template use cases and ports.
- `apps/console/src/infrastructure/sdk`: new `collaboration.ts`; changes to agents, secrets, members, settings, teams, reports, templates adapters.
- `apps/console/src/presentation`: new `screens/t16-collaboration/`; changes to `t1-overview`, `t2-agents`, `t3-create-agent`, `t4-secrets`, `t6-members`, `s2-teams`, `s3-create-team`, `s10-settings` (new tab, identity providers, agent templates), `t11-reports`, `s8-reports`, `p5-swarm-templates`, `shell/Chrome.tsx`.
- `apps/console/e2e`: fake API fixtures, specs under `specs/collaboration/`, quality specs, baselines.
- Docs: `README.md`, `docs/*`, `user-docs/*`, `CHANGELOG.md`.

## Edge cases covered by the stories

API older than v1.3.0 (no `collaboration:*` permission): no item, tile or route. `404 collaboration_agent_missing`: empty state, no further requests. A racing `409 collaboration_agent_exists` on create. `412` on put keeps the pending choice. A stored-on surface that is not effective can still be turned off. Suspended team disables every mutating control. Partial failure in bulk connect. Unknown enum values (`managedBy`, `linkState`, reasons) render raw. A failing panel never blanks the page. `429 Retry-After` pauses polling. `ListMembers` failure omits the team-admin names on V3. `hostname_held` on create team.

## Open questions

| # | Question | Owner | Default built |
|---|---|---|---|
| OQ-WP2 | Mockups for T3 role step, T1 tile, S10 tab, T6 picker; existing mockups predate the nav item | root (J) | Existing patterns; web lead approves baselines |
| OQ-WP7 | Exact CLI flag spellings for previews | `-cli` | `--web-ui-enabled`/`--no-web-ui-enabled`, `--registration-mode`, `--names`, `--managed-by`, `--may-expose-collaboration` |
| OQ-IMP1 | Re-pin to the restapi merge commit | coordinator | Pin 3588074 now (re-pinned from 99bfcfc for the collaboration report kind) |

## Parked (needs a real cluster, AWS account or edge)

| Item | Why parked |
|---|---|
| `@dev` smoke `open paperclip opens the team hostname in a new tab` | Needs a dev environment with `collab.base_domain` set; the spec is written and runs only with `E2E_DEV=1` |
| Real-environment check of managed-mode link states (WEB-US-48/50) | Needs `afs-reconciler` managed registration |
| J's sign-off of baselines T16 and V3 | Human approval |

## Review verdict (review-spec, 2026-11-22)

| Dimension | Status | Note |
|---|---|---|
| Acceptance criteria | ✅ Pass | Given/When/Then with exact texts and test names in the PRD |
| Technical approach | ✅ Pass | SDK first, clean architecture slice per feature, decisions WP-D1..23 |
| Component coverage | ✅ Pass | File and package list above |
| Edge case handling | ✅ Pass | Listed above and in stories |
| Open questions | ✅ Pass | Three, with defaults |
| Out-of-scope clarity | ✅ Pass | Non-goals in PRD §2 and above |
| Status initialization | ✅ Pass | status.md present |

Verdict: **Implementation-ready**.
