import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { SettingsPage } from "./SettingsPage.js";

/** S10: service settings (`/settings/:section`). Only service admins have it; anyone else gets not-found. */
export default function S10() {
  const me = useMe();
  if (!me.serviceAdmin) return <NotFoundPage />;
  return <SettingsPage />;
}
