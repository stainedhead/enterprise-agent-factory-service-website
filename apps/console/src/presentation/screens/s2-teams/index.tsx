import { useParams } from "react-router";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { TeamAdminPage } from "../team-admin/TeamAdminPage.js";
import { TeamsPage } from "./TeamsPage.js";

/**
 * S2: the teams table, or one team's administration page on `/teams/:teamId/admin`. Only service admins
 * have either; anyone else gets the not-found page (WEB-US-13.5).
 */
export default function S2() {
  const me = useMe();
  const { teamId } = useParams();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return teamId ? <TeamAdminPage teamId={teamId} /> : <TeamsPage />;
}
