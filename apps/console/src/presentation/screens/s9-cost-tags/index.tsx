import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { CostTagsPage } from "./CostTagsPage.js";

/** S9: cost allocation tags (`/cost-tags`); service admins only, team roles get not-found. */
export default function S9() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <CostTagsPage />;
}
