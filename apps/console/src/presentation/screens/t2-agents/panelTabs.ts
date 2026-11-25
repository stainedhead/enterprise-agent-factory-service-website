// Shared list: one entry per agent-panel tab, added by the owning stream (T2 details, logs and revisions
// here; External systems by T9/T10; usage, identity and configuration by later milestones).
import type { ComponentType } from "react";
import type { AgentRecord } from "../../../application/ports/agents.js";
import type { Permission } from "../../../domain/permission.js";
import { DetailsTab } from "./tabs/details/DetailsTab.js";
import { ExternalSystemsTab } from "./tabs/external-systems/ExternalSystemsTab.js";
import { IdentitiesTab } from "./tabs/identities/IdentitiesTab.js";
import { LogsTab } from "./tabs/logs/LogsTab.js";
import { McpTab } from "./tabs/mcp/McpTab.js";
import { ModelsRoutesTab } from "./tabs/models-routes/ModelsRoutesTab.js";
import { RevisionsTab } from "./tabs/revisions/RevisionsTab.js";
import { SecretsIdentityTab } from "./tabs/secrets-identity/SecretsIdentityTab.js";
import { UsageTab } from "./tabs/usage/UsageTab.js";

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
  // TG3/VG2 (1.2.0): Bedrock models and the agent's routes
  {
    id: "models",
    label: "Models & routes",
    permission: "model-endpoints:read",
    Component: ModelsRoutesTab,
  },
  // TM4 (1.3.0): the agent's MCP servers, blocks and discovery mode
  { id: "mcp", label: "MCP", permission: "team-mcp-servers:read", Component: McpTab },
  { id: "logs", label: "Logs", permission: "logs:read", Component: LogsTab },
  { id: "revisions", label: "Revisions", permission: "revisions:read", Component: RevisionsTab },
  { id: "usage", label: "Usage", permission: "reports:read", Component: UsageTab },
  {
    id: "external-systems",
    label: "External systems",
    permission: "external-systems:read",
    Component: ExternalSystemsTab,
  },
  {
    id: "secrets-identity",
    label: "Secrets & identity",
    permission: "identities:read",
    Component: SecretsIdentityTab,
  },
  {
    id: "identities",
    label: "Identities",
    permission: "identities:read",
    Component: IdentitiesTab,
  },
];
