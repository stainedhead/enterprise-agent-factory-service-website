import { Link, useParams } from "react-router";
import { Breadcrumbs, PageHeader } from "../../components/index.js";
import { McpUsagePanel } from "../sm-mcp/McpUsagePanel.js";

/** TM5 (screen 53, MCP-WEB-3): the team's MCP usage, enabled-but-unused access and refusals by reason. */
export function TeamMcpUsagePage() {
  const { teamId = "" } = useParams();
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "MCP usage" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="MCP usage"
        description="Every MCP request through the team gateway: server, tool, resource or prompt, agent, outcome. No arguments or results are stored."
        infoHref="/docs/mcp-servers"
      />
      <McpUsagePanel scope={{ level: "team", teamId }} />
    </div>
  );
}
