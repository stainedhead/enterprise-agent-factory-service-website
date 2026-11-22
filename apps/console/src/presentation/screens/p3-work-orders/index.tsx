import { useLocation } from "react-router";
import { CreateWorkOrderPage } from "./CreateWorkOrderPage.js";
import { WorkOrdersPage } from "./WorkOrdersPage.js";

/** P3: the work orders list, and *Create work order* at `/work-orders/new`. */
export default function P3() {
  const { pathname } = useLocation();
  return pathname.endsWith("/work-orders/new") ? <CreateWorkOrderPage /> : <WorkOrdersPage />;
}
