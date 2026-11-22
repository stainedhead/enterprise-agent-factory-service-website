import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { ModelsPage } from "./ModelsPage.js";

/** S4: model catalog and pricing (`/models`); service admins only. */
export default function S4() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <ModelsPage />;
}
