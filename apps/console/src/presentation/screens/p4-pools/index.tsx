import { useLocation, useParams } from "react-router";
import { useTeamKind } from "../../hooks/useTeamKind.js";
import { NotFoundPage } from "../../shell/pages.js";
import { CreatePoolPage } from "./CreatePoolPage.js";
import { PoolsPage } from "./PoolsPage.js";

/** P4: pools and stages of an ephemeral team (persistent teams have none: not found). */
export default function P4() {
  const { teamId = "" } = useParams();
  const { pathname } = useLocation();
  const { kind, loading } = useTeamKind(teamId);
  if (loading) return <p role="status">Loading…</p>;
  if (kind !== "ephemeral") return <NotFoundPage />;
  return pathname.endsWith("/pools/new") ? <CreatePoolPage /> : <PoolsPage />;
}
