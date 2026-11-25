import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { AddMcpServerPage } from "./AddMcpServerPage.js";

/** SM2: add an enterprise MCP server (`/mcp-servers/new`); service admins only. */
export default function SM2() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <AddMcpServerPage />;
}
