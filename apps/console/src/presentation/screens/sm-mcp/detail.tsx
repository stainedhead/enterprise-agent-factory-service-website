import { can } from "../../../domain/me.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { McpServerDetailPage } from "./McpServerDetailPage.js";

/** SM3: one MCP server (`/mcp-servers/:mcpServerId`); service admins and security operators. */
export default function SM3() {
  const me = useMe();
  if (!can(me, "mcp-servers:read")) return <NotFoundPage />;
  return <McpServerDetailPage />;
}
