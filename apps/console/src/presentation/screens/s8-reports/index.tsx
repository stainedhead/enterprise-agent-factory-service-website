import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { ServiceReportsPage } from "./ServiceReportsPage.js";

/** S8: service reports and cost reconciliation (`/reports`, `/reports/reconciliation`); service admins only. */
export default function S8() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <ServiceReportsPage />;
}
