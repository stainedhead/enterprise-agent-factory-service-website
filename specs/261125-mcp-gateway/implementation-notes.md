# Implementation notes

- M1: codegen skips `x-afs-sdk: none` (one operation) and renames eleven namespace-less names (`SDK_RENAMES`). A
  wrapper response (`TeamMcpServer`) gives the reader `versionIn: "server"`; an optional If-Match on such a path gets
  no reader. The MCP credential fields (`value`, `clientSecret`) are CLI secrets (`--secret-value file://<path>`,
  `--client-secret file://<path>`). The domain's browser-global rule ignores quoted names (`"window"` is the MCP
  report's query parameter in the generated CLI table); a red case keeps references caught.
- M2-M4: `McpUsageQuery.windowDays` (not `window`, which the architecture test forbids in application code; the
  adapter maps it to the `window` query parameter). The credential mapper copies metadata members only, and
  `startOAuth` returns `{authorizationUrl, expiresAt}`. Policy rules drop `undefined` members (exact optional types).
- M5-M6: screens share `sm-mcp/shared.tsx` (keys, badges, inventory table). The OAuth connect mutation opens the
  window and returns `void`, so the URL is not cached by TanStack Query. Credential dialogs use `useSecretMutation`
  and `SecretInput`. `governedBy` locks the external system switch with `aria-describedby` and a link to the server.
- M7: the fake MCP fixtures keep servers, primitives, team switches, federated identities and the capture window in
  module state reset on `/__reset`; the platform team is the one that may not register servers (403
  `team_servers_not_allowed`). The security operator now has four navigation links (MCP reviews, MCP servers).
  Running the whole Playwright suite in this sandbox shows that the approved baselines predate the 1.1.0 and 1.2.0
  navigation (for example *Orchestration* and *Model endpoints* are missing from them), so every approved visual
  comparison that shows the team navigation already differs; they were not regenerated here, by rule.
