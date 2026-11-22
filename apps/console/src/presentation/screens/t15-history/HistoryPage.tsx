import { Link, useLocation, useNavigate, useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { Breadcrumbs, PageHeader, Tabs } from "../../components/index.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { sections } from "./tabs.js";

/** T15 (WEB-US-35): activity and audit, and config revisions, as tabs of one page. */
export function HistoryPage() {
  const { teamId = "" } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const visible = sections.filter((s) => can(me, s.permission, teamId));
  const active = visible.find((s) => pathname.endsWith(`/history/${s.id}`));
  if (!active) return <NotFoundPage />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "History" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="History" infoHref="/docs/history" />
      <Tabs
        label="History"
        activeId={active.id}
        onChange={(id) => navigate(`/t/${teamId}/history/${id}`)}
        tabs={visible.map((s) => ({
          id: s.id,
          label: s.label,
          content: <s.Component teamId={teamId} />,
        }))}
      />
    </div>
  );
}
