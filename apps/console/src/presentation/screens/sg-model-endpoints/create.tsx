import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { CreateEndpointPage } from "./CreateEndpointPage.js";

/** SG2: create a service model endpoint (`/model-endpoints/new`); service admins only. */
export default function SG2() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <CreateEndpointPage />;
}
