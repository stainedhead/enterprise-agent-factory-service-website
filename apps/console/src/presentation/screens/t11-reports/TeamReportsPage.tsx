import { Link, useParams, useSearchParams } from "react-router";
import { can } from "../../../domain/me.js";
import { Breadcrumbs, PageHeader, Tabs } from "../../components/index.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { sections } from "./sections.js";

/** T11 (WEB-US-37.1): the team's reports as tabs: budget and usage, activity, models, external systems. */
export function TeamReportsPage() {
  const { teamId = "" } = useParams();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const visible = sections.filter((s) => can(me, s.permission, teamId));
  const active = visible.find((s) => s.id === params.get("tab")) ?? visible[0];
  if (!active) return <NotFoundPage />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Reports" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Reports" infoHref="/docs/reports" />
      <Tabs
        label="Reports"
        activeId={active.id}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={visible.map((s) => ({
          id: s.id,
          label: s.label,
          content: <s.Component teamId={teamId} />,
        }))}
      />
    </div>
  );
}
