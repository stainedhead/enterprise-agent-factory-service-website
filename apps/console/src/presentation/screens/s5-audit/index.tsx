import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { AuditPage } from "./AuditPage.js";

/** S5: service audit log (`/audit`); service admins only. */
export default function S5() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <AuditPage />;
}
