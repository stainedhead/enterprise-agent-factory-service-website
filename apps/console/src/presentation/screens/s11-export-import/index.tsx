import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { ExportImportPage } from "./ExportImportPage.js";

/** S11: export and import (`/export-import`); service admins only. */
export default function S11() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <ExportImportPage />;
}
