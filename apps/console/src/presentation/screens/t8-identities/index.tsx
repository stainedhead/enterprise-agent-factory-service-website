import { useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { IdentitiesPage } from "./IdentitiesPage.js";

/** T8: the team's agent identities (`/t/:teamId/identities`). */
export default function T8() {
  const { teamId = "" } = useParams();
  const me = useMe();
  if (!can(me, "identities:read", teamId)) return <NotFoundPage />;
  return <IdentitiesPage teamId={teamId} />;
}
