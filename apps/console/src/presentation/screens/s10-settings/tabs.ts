// Shared list: one entry per S10 section, in tab order. A stream adds its own section here (agent
// templates M2, storage classes, service API keys, security operators, notification channels).
import type { ComponentType } from "react";
import type { Permission } from "../../../domain/permission.js";
import { AgentTemplatesTab } from "./tabs/agent-templates/AgentTemplatesTab.js";
import { IdentityProvidersTab } from "./tabs/identity-providers/IdentityProvidersTab.js";
import { NotificationChannelsTab } from "./tabs/notification-channels/NotificationChannelsTab.js";
import { SettingsTab } from "./tabs/settings/SettingsTab.js";
import { StorageClassesTab } from "./tabs/storage-classes/StorageClassesTab.js";

export interface SettingsSection {
  /** The `:section` of `/settings/:section`. */
  readonly id: string;
  readonly label: string;
  /** The section is shown only to callers who hold this service permission. */
  readonly permission: Permission;
  readonly Component: ComponentType;
}

export const sections: readonly SettingsSection[] = [
  { id: "general", label: "Settings", permission: "admin:settings", Component: SettingsTab },
  {
    id: "identity-providers",
    label: "Identity providers",
    permission: "admin:identity-providers",
    Component: IdentityProvidersTab,
  },
  {
    id: "storage-classes",
    label: "Storage classes",
    permission: "admin:storage-classes",
    Component: StorageClassesTab,
  },
  {
    id: "agent-templates",
    label: "Agent templates",
    permission: "admin:agent-templates",
    Component: AgentTemplatesTab,
  },
  {
    id: "notification-channels",
    label: "Notification channels",
    permission: "admin:settings",
    Component: NotificationChannelsTab,
  },
];
