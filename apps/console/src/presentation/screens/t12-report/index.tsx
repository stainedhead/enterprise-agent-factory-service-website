import { Link, useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { Breadcrumbs, PageHeader } from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { ReportPanel } from "../t11-reports/ReportPanel.js";

/** T12 (WEB-US-37.2): one agent's usage and cost report (`/t/:teamId/reports/agents/:agentId`). */
export default function T12() {
  const { teamId = "", agentId = "" } = useParams();
  const me = useMe();
  if (!can(me, "reports:read", teamId)) return <NotFoundPage />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Reports", to: `/t/${teamId}/reports` },
          { label: agentId },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title={`Report for ${agentId}`} infoHref="/docs/reports" />
      <ReportPanel
        scope={{ level: "agent", teamId, agentId }}
        kind="usage"
        title="Usage by model"
        groupBy={["model", "day"]}
        defaultGroupBy={["model"]}
        csvDisabledReason={gate(me, "reports:read", teamId)}
      />
    </div>
  );
}
