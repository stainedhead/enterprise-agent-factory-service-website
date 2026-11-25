# Status: mcp-gateway

Created: 2026-11-25. Source: [mcp-gateway-PRD.md](mcp-gateway-PRD.md).

## Overall progress

| Phase | Status |
|---|---|
| 0 Initial research | Complete |
| 1 Specification | Complete |
| 2 Research and data modeling | Complete |
| 3 Architecture and planning | Complete |
| 4 Task breakdown | Complete |
| 5 Implementation | Complete (M1-M9) |
| 6 Completion and archival | Pending |

## Tasks

See [tasks.md](tasks.md).

## Blockers

None.

## Recent activity

- 2026-11-25: spec created on top of the 1.2.0 branch (PR #14, not yet merged); contract re-pinned to `ef92a4c`
  (v1.6.0, 276 operations) with `contract:update`; SDK regenerated; eleven namespace-less SDK names and the
  browser-only OAuth callback handled in codegen; wrapped-version reader; MCP helpers, `McpReason`, MCP usage
  reports; version 1.3.0; permission mirror at 77 entries; SDK tests 461 green (M1).
- 2026-11-25: console domain (`domain/mcp.ts`: words, badges, approval rules, drafts and validation, policy rules,
  env preview, CLI builders), application (MCP ports and six use-case classes) and infrastructure (`SdkMcpCatalog`,
  `SdkTeamMcp`, `SdkMcpUsage`, `SdkFederatedIdentities`) wired in `main/wiring.ts`; console 1778 tests green,
  domain and application coverage 97.3% statements, 92.8% branches (M2-M4).
- 2026-11-25: screens SM1 to SM5 (SM5 as the *MCP* tab of service reports), the S10 *MCP* section, TM1 to TM5 and
  VM1 (TM4 as the agent panel's *MCP* tab), `governedBy` on external system switches, the MCP members of the team
  gateway settings, federated identities on *Secrets & identity*; visual approvals recorded `pending` for the 11
  new screens; console 1803 tests green (M5, M6).
- 2026-11-25: stateful fake MCP fixtures (`e2e/fake-afs/fixtures/mcp.ts`, every MCP operation of contract 1.6.0, bodies
  validated against the pinned OpenAPI, 7 fixture tests), GetMe grants for the MCP permissions (team roles and the
  security operator), `e2e/specs/mcp/mcp.spec.ts` (14 tests: SM1, SM3, SM4, SM5, TM1 to TM4, VM1, denied cases, a
  credential sentinel scan, visuals 46 to 55 and 51b), MCP routes in the axe, CSP and viewer sweeps. Playwright ran
  locally (chromium 1243): the 11 functional MCP tests, the sweeps and the security operator spec pass; the 11 new
  baselines are left for CI (`[regen-new-baselines]`). The security operator navigation test now expects the MCP
  items (M7).
- 2026-11-25: docs: README *Governed MCP servers* section with `docs/images/mcp-gateway.svg` (copied from the root),
  CHANGELOG 1.3.0, user-docs (SDK and console MCP sections), AGENTS.md status, PRD stub; research notes 11 to 15
  and screen placement recorded (M8).
- 2026-11-25: `bun run gate` green: SDK 461 tests; console 1810 tests in 175 files, domain and application coverage
  97.3% statements, 92.8% branches, 97.5% functions; lint, typecheck, build, size and TSDoc checks pass. Pushed with
  `[regen-new-baselines]` so CI writes the 11 pending baselines (M9). Archival waits on J's approval of the baselines.
- 2026-11-25: 1.2.0 (PR #14) merged to main and merged into this branch; PR #15 retargeted to main. J approved the
  MCP baselines (46-55, 51b) and the navigation with the MCP items. `[regen-baselines]` on 4b45627 rewrote 60
  baselines in CI (5cc9518). Each diff was checked: the left nav (MCP reviews, MCP servers, MCP usage), the
  agent tab strip (*MCP* tab), the service settings and reports tabs (*MCP*) and the team gateway settings
  (MCP servers and placement). This commit triggers the normal CI run that compares against them.
