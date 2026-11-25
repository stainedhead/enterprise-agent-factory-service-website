# PRD: Governed MCP servers through the team gateway (website extract)

The approved change PRD is [`mcp-gateway-PRD.md`](https://github.com/stainedhead/enterprise-agent-factory-service/blob/main/mcp-gateway-PRD.md)
in the root repository (approved for build by J, 2026-11-25; release 1.3.0 in every repository). This repository
builds Appendix E.4 (MCP-SDK-1) and E.5 (MCP-WEB-1 to MCP-WEB-5), the console part of §13.4, the screens of §17 (46
to 55) and the console share of MCP-US-1 to MCP-US-10 and test cases TC-13, TC-14, TC-20 and TC-25. API contract:
the root's `docs/contracts/api-contract.md` §4.14, v1.6.0 (pinned here from `-restapi` `ef92a4c`).

## Requirements

| ID | Requirement | Proves |
|---|---|---|
| MCP-SDK-1 | `@afs/sdk` regenerated from contract v1.6.0; MCP usage reports, `effectiveTools`, env-name helpers, `McpReason`; credential setters return metadata only | SDK tests, contract replay |
| MCP-WEB-1 | Service admin screens 46, 47, 48 and 55; the MCP section of service settings with the three-option approval policy | e2e |
| MCP-WEB-2 | Screen 49, *Governance › MCP reviews*, for service admins and security operators: approve, reject, ask for changes, note required | TC-20 |
| MCP-WEB-3 | Team screens 50, 51, 53 and 54 (read-only); controls disabled with tooltips by role, by `mayAddMcpServers` and by the approval policy; OAuth *Connect* opens the authorization URL in a new window | TC-13, TC-14 |
| MCP-WEB-4 | Screen 52, the agent MCP tab: all or selected servers, blocks, search or full mode, env names, effective tools with the deciding level; federated identities | TC-25 |
| MCP-WEB-5 | `can(...)` gates mirror Appendix A with denied tests; no secret value in state, URL or storage; axe on every new screen; Playwright and visual baselines 46 to 55, approved by J | e2e, unit |

## Stories

Numbering continues the website stories (last WEB-US-67 in 1.2.0).

**WEB-US-68 · The SDK speaks contract 1.6.0 (MCP-SDK-1).** Given the contract pinned at `ef92a4c`, then
`mcpServers`, `mcpReviews`, `mcpEvents`, `mcpSettings`, `teams.mcpServers`, `teams.mcpEvents`, `teams.reports.mcp`,
`agents.mcp`, `agents.federatedIdentities` and `pools.*` equivalents exist with TSDoc, and the replay parses every
new example.

**WEB-US-69 · Service admins govern the catalog (MCP-US-1, MCP-US-2).** Screens 46 to 48: catalog with kind, status,
risk, tools and adoption; the add wizard with a review step and the `afs` command; import of `server.json` as a
draft; detail with inventory, held changes with a diff and checks, service policy, write-only credentials and teams.

**WEB-US-70 · Reviewers decide team servers (MCP-US-4, MCP-US-5).** Screen 49: pending servers and held primitives of
every team; approve with per-tool decisions, reject or ask for changes, each with a required note; the approver
named by the service policy.

**WEB-US-71 · Teams switch servers on and register their own (MCP-US-3, MCP-US-4, MCP-US-10).** Screens 50, 51 and
54: switch on in full or read-only mode, the credential prompt (`Credential required`), OAuth connect, federation
test, registration with review and submit; viewers read only.

**WEB-US-72 · Team-admins narrow agents (MCP-US-6, MCP-US-7).** Screen 52, saved through `UpdateAgent` with If-Match.

**WEB-US-73 · Everyone sees usage (MCP-US-9).** Screens 53 and 55, CSV download, enabled-but-unused and refusals.
