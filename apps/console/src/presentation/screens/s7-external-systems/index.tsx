import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { CatalogPage } from "./CatalogPage.js";

/** S7: the service catalog of external systems (`/external-systems`); service admins only. */
export default function S7() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <CatalogPage />;
}
