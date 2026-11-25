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
| 5 Implementation | In progress (M1-M6 done) |
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
