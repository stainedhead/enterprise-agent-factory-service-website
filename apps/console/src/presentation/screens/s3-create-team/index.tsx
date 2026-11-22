import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { CreateTeamPage } from "./CreateTeamPage.js";

/** S3 is for service admins; anyone else gets the not-found page. */
export default function S3() {
  const me = useMe();
  return me.serviceAdmin ? <CreateTeamPage /> : <NotFoundPage />;
}
