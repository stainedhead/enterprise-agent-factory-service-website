import { AgentConfiguration } from "../../AgentConfiguration.js";
import type { PanelTabProps } from "../../panelTabs.js";

/** *Details*: a worker agent's configuration (WEB-US-25.2, 25.3). */
export function DetailsTab(props: PanelTabProps) {
  return <AgentConfiguration {...props} variant="worker" />;
}
