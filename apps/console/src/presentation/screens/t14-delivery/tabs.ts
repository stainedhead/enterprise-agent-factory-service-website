// Shared list: one entry per T14 tab, added by the owning stream (*Notifications* here; *Log delivery* by M4-L).
import type { ComponentType } from "react";
import type { Permission } from "../../../domain/permission.js";
import { LogsTab } from "./tabs/logs/LogsTab.js";
import { NotificationsTab } from "./tabs/notifications/NotificationsTab.js";

export interface TabDef {
  /** The last segment of the route: `/t/:teamId/delivery/<id>`. */
  readonly id: string;
  readonly label: string;
  /** The tab is shown only to callers who hold this permission in the team. */
  readonly permission: Permission;
  readonly Component: ComponentType<{ teamId: string }>;
}

export const tabs: readonly TabDef[] = [
  {
    id: "notifications",
    label: "Notifications",
    permission: "notifications:read",
    Component: NotificationsTab,
  },
  { id: "logs", label: "Log delivery", permission: "logs:read", Component: LogsTab },
];
