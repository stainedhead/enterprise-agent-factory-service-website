import { Link, useLocation, useNavigate, useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { Breadcrumbs, PageHeader, Tabs } from "../../components/index.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { sections } from "./tabs.js";

/** S10 (WEB-US-20): the sections of service settings, one tab each; a section the caller lacks is not-found. */
export function SettingsPage() {
  const params = useParams();
  const { pathname } = useLocation();
  // the navigation items are literal routes (`/settings/general`), so the section comes from the path
  const section = params.section ?? pathname.split("/")[2];
  const navigate = useNavigate();
  const me = useMe();
  const visible = sections.filter((s) => can(me, s.permission));
  const active = visible.find((s) => s.id === section);
  if (!active) return <NotFoundPage />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Service settings" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Service settings" infoHref="/docs/service-settings" />
      <Tabs
        label="Service settings"
        activeId={active.id}
        onChange={(id) => navigate(`/settings/${id}`)}
        tabs={visible.map((s) => ({ id: s.id, label: s.label, content: <s.Component /> }))}
      />
    </div>
  );
}
