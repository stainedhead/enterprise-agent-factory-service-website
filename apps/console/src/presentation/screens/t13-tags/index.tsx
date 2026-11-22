import { useParams } from "react-router";
import { can } from "../../../domain/me.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { TagsPage } from "./TagsPage.js";

/** T13: team tags (`/t/:teamId/tags`). */
export default function T13() {
  const { teamId = "" } = useParams();
  const me = useMe();
  if (!can(me, "tags:read", teamId)) return <NotFoundPage />;
  return <TagsPage teamId={teamId} />;
}
