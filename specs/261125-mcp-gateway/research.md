# Research

## Contract
- Pinned `-restapi` `ef92a4c82e028e812d9f485287ebe26d5605375a`, `info.version` 1.6.0, 276 operations (221 + 55),
  with `bun run contract:update --ref <sha>` (files byte-identical to that commit's `api/`).
- Permissions in `permissions.json`: `mcp-servers:read`, `mcp-servers:review`, `mcp-servers:suspend` (service admin,
  security operator); `mcp-servers:write`, `mcp-settings:write` (service admin); `team-mcp-servers:read` (every team
  role); `team-mcp-servers:write` and `agent-federated-identities:write` (team-admin, service admin);
  `team-mcp-servers:approve` (service admin; team-admin under the condition `mcpApprovalPolicy`, decided by the API);
  `mcp-events:read` (every role: team roles for their team, service roles for all).

## Contract notes (discrepancies found while building)
1. **Namespace-less SDK names.** Eleven operations carry `x-afs-sdk` without a namespace (`.reject()`, `.delete()`,
   `.resume()`...). Codegen names them after the sibling operations on the same resource (`SDK_RENAMES`):
   `mcpServers.reject/rejectPrimitive/requestChanges/resume/retire`, `mcpSettings.stopQueryCapture`,
   `teams.mcpServers.delete/reject/rejectPrimitive`, `agents.federatedIdentities.delete`,
   `pools.federatedIdentities.delete`. The contract should spell them out.
2. **Browser-only operation.** `CompleteMcpOAuthConnect` (`GET /v1/mcp-oauth/callback`) has `x-afs-sdk: none`: the
   identity provider redirects the browser there and the API redirects back to the console with
   `?mcpOAuth=connected` or `?mcpOAuth=failed&reason=…`. Codegen skips it; the console reads those parameters.
3. **Wrapped version.** `GetTeamMcpServer` returns `TeamMcpServer` whose version is `server.version`. The generic
   reader would have sent `If-Match: "1"`; the reader now names `versionIn: "server"` for `UpdateTeamMcpServer` and
   `DeleteTeamMcpServer`. `PutTeamMcpServer` (optional If-Match on the team's switch, whose version is not on the
   wire) gets no reader, so the SDK sends no If-Match there.
4. **No policy read.** `PutMcpPolicy` and `PutTeamMcpPolicy` replace the rules, but no operation returns the stored
   rules (`McpServer` has no `policy`). The console shows each primitive's decision and deciding level from
   `ListMcpPrimitives`, and the policy editor starts from the rules saved in this session (empty on a fresh load),
   saying that saving replaces the stored rules.
5. **No per-server calls or agents.** `ListMcpServers` and `ListTeamMcpServers` carry `adoption` (teams, agents) but
   no call counts; screens 46 and 50 take *Calls, 30 d* from the usage report grouped by server.
6. **Service MCP report has no team filter.** `GetMcpUsageReport` takes `groupBy`, `view`, `window`, `from`, `to`;
   screen 55's *Team: all* filter is not offered; the *Teams* view groups by team instead.
7. **Credentials path.** Root contract Appendix D names `PUT /v1/mcp-servers/{id}/credential`; the OpenAPI has
   `/credentials/{scope}` (`_shared` or a team id). The console follows the OpenAPI.
8. **Settings keys.** `mcp.*` keys are written with the existing `PutSetting` (`admin:settings`), while Appendix A
   gives `mcp-settings:write`. The console gates the MCP settings section on both (`admin:settings` for the call,
   which only service admins hold, and shows `mcp-settings:write` for query capture).
9. **Effective MCP of an agent.** `Agent.mcp` carries `access`, `serverIds`, `mode`, `blocks`, `effectiveServers`
   and `env` (names only); `GetEffectiveAgentMcp` adds the primitives with the deciding level and the per-server URL.
   The agent's MCP settings are saved through `UpdateAgent` `mcp` with If-Match (no `PutAgentMcp` operation).
10. **Env values.** The API returns env *names*; the console renders values from `AFS_GATEWAY_URL` (the agent's model
    env, 1.2.0) plus the gateway contract's paths (`/mcp`, `/mcp/<slug>`), and `…` when the gateway URL is unknown.
