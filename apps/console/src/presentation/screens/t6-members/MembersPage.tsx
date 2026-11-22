import { Link, useLocation, useNavigate, useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { Breadcrumbs, PageHeader, Tabs } from "../../components/index.js";
import { useMe } from "../../shell/ShellContext.js";
import { ApiKeysTab } from "./ApiKeysTab.js";
import { MembersTab } from "./MembersTab.js";

/** T6 (WEB-US-29): the *Members* tab, and the *API keys* tab only where `api-keys:read` is held (D50). */
export function MembersPage() {
  const { teamId = "" } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const showKeys = can(me, "api-keys:read", teamId);
  const tab = showKeys && pathname.endsWith("/api-keys") ? "keys" : "members";
  const tabs = [
    { id: "members", label: "Members", content: <MembersTab teamId={teamId} /> },
    ...(showKeys
      ? [{ id: "keys", label: "API keys", content: <ApiKeysTab teamId={teamId} /> }]
      : []),
  ];
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Members & access" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Members & access" infoHref="/docs/members" />
      <Tabs
        label="Members and API keys"
        activeId={tab}
        onChange={(id) =>
          navigate(id === "keys" ? `/t/${teamId}/members/api-keys` : `/t/${teamId}/members`)
        }
        tabs={tabs}
      />
    </div>
  );
}
