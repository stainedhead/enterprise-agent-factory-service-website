// Shared list: one entry per agent-panel tab, added by the owning stream (T2 details, logs and revisions
// here; External systems by T9/T10; usage, identity and configuration by later milestones).
import type { ComponentType } from "react";
import type { AgentRecord } from "../../../application/ports/agents.js";
import type { Permission } from "../../../domain/permission.js";
import { DetailsTab } from "./tabs/details/DetailsTab.js";
import { LogsTab } from "./tabs/logs/LogsTab.js";
import { RevisionsTab } from "./tabs/revisions/RevisionsTab.js";

export interface PanelTabProps {
  readonly teamId: string;
  readonly agent: AgentRecord;
}

export interface PanelTab {
  readonly id: string;
  readonly label: string;
  /** The tab is shown only to callers who hold this permission in the team. */
  readonly permission: Permission;
  readonly Component: ComponentType<PanelTabProps>;
}

export const panelTabs: readonly PanelTab[] = [
  { id: "details", label: "Details", permission: "agents:read", Component: DetailsTab },
  { id: "logs", label: "Logs", permission: "logs:read", Component: LogsTab },
  { id: "revisions", label: "Revisions", permission: "revisions:read", Component: RevisionsTab },
];
