# Architecture

- `domain/mcp.ts`: pure rules: kind, risk, status, credential and auth words; transport and location words; the
  approval rule (who approves a tier under each `mcp.team_server_approval`); slug, URL and form validation for the
  add and register wizards; policy rule validation; the agent env preview (gateway contract §13.5 order: `AFS_MCP_URL`,
  `AFS_MCP_MODE`, `AFS_MCP_SERVERS`, then `AFS_MCP_<SLUG>_URL` by slug); CLI builders for every form.
- `application/ports/mcp.ts`: `McpCatalogPort` (service), `TeamMcpPort` (team), `McpUsagePort`,
  `FederatedIdentitiesPort`.
- `application/usecases/mcp/*`: catalog split (enterprise, team-managed) and counts; create, import, publish,
  retire, suspend and resume (reason required); inventory and held changes; service policy; shared credentials;
  review queue and decisions (note required); query capture; team switch (published only, team gateway required),
  team server register and submit, OAuth connect and disconnect, federation test, team policy; agent MCP save
  through `UpdateAgent` with If-Match; usage report; settings.
- `infrastructure/sdk/mcp.ts`: SDK adapters (`mcpServers`, `mcpReviews`, `mcpSettings`, `teams.mcpServers`,
  `agents.mcp`, `agents.federatedIdentities`, `createReports().mcpUsage/teamMcpUsage`).
- Presentation: `screens/sm-mcp` (SM1..SM6), `screens/tm-mcp` (TM1..TM3, TM5, VM1), `screens/t2-agents/tabs/mcp`
  (TM4), shared `screens/sm-mcp/shared.tsx` (badges, keys, error alert).
- Secrets: credential forms use `SecretInput` and `useSecretMutation`, like T4 and the 1.2.0 key dialogs.
