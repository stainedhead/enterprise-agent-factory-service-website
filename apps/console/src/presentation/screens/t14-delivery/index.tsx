import { Link, useLocation, useNavigate, useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { Breadcrumbs, PageHeader, Tabs } from "../../components/index.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { tabs } from "./tabs.js";

/** T14 (WEB-US-34): log delivery and notifications, one tab each (`/t/:teamId/delivery/:tab`). */
export default function T14() {
  const { teamId = "" } = useParams();
  const tab = useLocation().pathname.split("/").pop();
  const me = useMe();
  const navigate = useNavigate();
  const visible = tabs.filter((t) => can(me, t.permission, teamId));
  const active = visible.find((t) => t.id === tab) ?? visible[0];
  if (!active) return <NotFoundPage />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Delivery" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Delivery" infoHref="/docs/delivery" />
      <Tabs
        label="Delivery"
        activeId={active.id}
        onChange={(id) => navigate(`/t/${teamId}/delivery/${id}`, { replace: true })}
        tabs={visible.map((t) => ({
          id: t.id,
          label: t.label,
          content: <t.Component teamId={teamId} />,
        }))}
      />
    </div>
  );
}
