# Spec: governed MCP servers (website 1.3.0)

Source: [mcp-gateway-PRD.md](mcp-gateway-PRD.md) (root `mcp-gateway-PRD.md`, Appendix E.4 MCP-SDK-1 and E.5
MCP-WEB-1 to MCP-WEB-5; approved for build by J, 2026-11-25; release 1.3.0 in every repository).

## Goal
Agents reach governed MCP servers only through their team gateway, which holds every credential and pins every tool
definition. `@afs/sdk` moves to contract 1.6.0, and the console gives service admins the catalog, the add and import
wizard, server detail (inventory, held changes, service policy, credentials, teams), the review queue (with security
operators) and the service-wide report; and gives teams the switch-on catalog, team-registered servers, the agent MCP
tab and the team usage report, read-only for viewers.

## In scope
- SDK: contract pinned to `-restapi` `ef92a4c` (1.6.0, 276 operations, 275 with an SDK method); regenerated; namespace
  fixes for the eleven `.name()` SDK names; wrapped-version If-Match reader (`TeamMcpServer.server.version`);
  `reports.mcpUsage` / `reports.teamMcpUsage`; `McpReason`; `effectiveTools`, `mcpServerUrlEnv`, `isMcpSlug`,
  `qualifiedMcpName`, `MCP_ENV`; version 1.3.0.
- Console (mockups 46 to 55 of the root `docs/ui/`):

| Screen | Id | Route | Role |
|---|---|---|---|
| 46 MCP server catalog | SM1 | `/mcp-servers` | service admin, security operator (read) |
| 47 Server detail | SM3 | `/mcp-servers/:mcpServerId` (`?tab=`) | service admin, security operator (read, suspend) |
| 48 Add enterprise server (wizard, import) | SM2 | `/mcp-servers/new` | service admin |
| 49 MCP review queue and review | SM4 | `/mcp-reviews`, `/mcp-reviews/:mcpServerId` | service admin, security operator |
| 55 MCP usage across teams (the *MCP* tab of S8) | SM5 | `/reports/mcp` | service admin, security operator |
| MCP section of service settings (the S10 *MCP* section, no separate screen id) | S10 | `/settings/mcp` | service admin |
| 50 Team MCP servers | TM1 | `/t/:teamId/mcp-servers` | team-admin |
| 51 Register team server (wizard) | TM2 | `/t/:teamId/mcp-servers/new` | team-admin |
| Team server detail (credential, OAuth, federation, held tools) | TM3 | `/t/:teamId/mcp-servers/:mcpServerId` | every team role |
| 52 Agent MCP tab | TM4 | `/t/:teamId/agents/:agentId?tab=mcp` | team-admin (viewer read-only) |
| 53 Team MCP usage | TM5 | `/t/:teamId/mcp-usage` | every team role |
| 54 Team MCP servers, read-only | VM1 | `/t/:teamId/mcp-servers` | team viewer |

- Also: `governedBy` on external systems (switch disabled, link to the server); `mayAddMcpServers` and
  `mcpPlacement` in the team gateway settings (service admin team page); agent federated identities on the agent's
  *Secrets & identity* tab (PRD Appendix C).
- Permission mirror (ten new permissions, the `mcpApprovalPolicy` condition), use cases with fake ports, CLI previews
  on every create and change form, AWS-console conventions, disabled-not-hidden controls with the role named,
  credential values only in the input, WCAG 2.2 AA.
- Playwright: fake API fixtures for the MCP operations, a spec for the MCP screens, routes in the axe, CSP and viewer
  sweeps, visual baselines 46 to 55 (pending J).
- Docs: user-docs (SDK and console MCP usage), CHANGELOG 1.3.0, README MCP section with the diagram, AGENTS.md status,
  website PRD stub.

## Acceptance
The website share of MCP-US-1 to MCP-US-10 (PRD §15) and TC-13, TC-14, TC-20, TC-25 (ui); `bun run gate` green;
`architecture.test.ts` green; domain and application coverage at 90% or more; every permission has a denied case.

## Non-goals
The PRD's non-goals; anything contract 1.6.0 has no operation for (see research.md, contract notes); pool MCP tabs
(the pool screens of 1.1.0 have no per-pool tab set; pools keep `mcp` through the API and CLI).
