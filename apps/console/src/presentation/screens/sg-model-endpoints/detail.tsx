import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { EndpointDetailPage } from "./EndpointDetailPage.js";

/** SG3: one model endpoint (`/model-endpoints/:endpointId`); service admins only. */
export default function SG3() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <EndpointDetailPage />;
}
