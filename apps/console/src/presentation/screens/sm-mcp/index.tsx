import { can } from "../../../domain/me.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { McpCatalogPage } from "./McpCatalogPage.js";

/** SM1: the MCP server catalog (`/mcp-servers`); service admins and security operators. */
export default function SM1() {
  const me = useMe();
  if (!can(me, "mcp-servers:read")) return <NotFoundPage />;
  return <McpCatalogPage />;
}
