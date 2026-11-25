import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { ModelEndpointsPage } from "./ModelEndpointsPage.js";

/** SG1 and SG6: model endpoints, price proposals and provider policy (`/model-endpoints`); service admins only. */
export default function SG1() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <ModelEndpointsPage />;
}
