// Shared list: the tabs of T11 in order, added by the owning stream (M4-S adds *Schedules* here).
import type { ComponentType } from "react";
import type { Permission } from "../../../domain/permission.js";
import { InferencePanel } from "./InferencePanel.js";
import { type ReportSectionConfig, ReportSectionView } from "./ReportSection.js";
import { SchedulesTab } from "./schedules/SchedulesTab.js";

export interface ReportsSection {
  /** The `?tab=` value. */
  readonly id: string;
  readonly label: string;
  readonly permission: Permission;
  readonly Component: ComponentType<{ teamId: string }>;
}

export const sections: readonly ReportsSection[] = [
  {
    id: "budget",
    label: "Budget & usage",
    permission: "reports:read",
    Component: ({ teamId }) => (
      <ReportSectionView
        teamId={teamId}
        cfg={
          {
            title: "Daily cost",
            kind: "costs",
            groupBy: ["day", "model", "agent"],
            defaultGroupBy: ["day", "model"],
            filters: ["agentId", "modelId"],
          } satisfies ReportSectionConfig
        }
      />
    ),
  },
  {
    id: "activity",
    label: "Activity",
    permission: "reports:read",
    Component: ({ teamId }) => (
      <ReportSectionView
        teamId={teamId}
        cfg={
          {
            title: "Agent activity",
            kind: "activity",
            groupBy: ["agent", "day", "hour"],
            defaultGroupBy: ["agent"],
            filters: ["agentId"],
          } satisfies ReportSectionConfig
        }
      />
    ),
  },
  {
    id: "models",
    label: "Models",
    permission: "reports:read",
    Component: ({ teamId }) => (
      <ReportSectionView
        teamId={teamId}
        cfg={
          {
            title: "Usage by model",
            kind: "usage",
            groupBy: ["model", "day", "agent"],
            defaultGroupBy: ["model"],
            filters: ["agentId", "modelId"],
          } satisfies ReportSectionConfig
        }
      />
    ),
  },
  {
    id: "inference",
    label: "Inference",
    permission: "reports:read",
    Component: ({ teamId }) => <InferencePanel scope={{ level: "team", teamId }} />,
  },
  {
    id: "external-systems",
    label: "External systems",
    permission: "reports:read",
    Component: ({ teamId }) => (
      <ReportSectionView
        teamId={teamId}
        cfg={
          {
            title: "External traffic",
            kind: "traffic",
            groupBy: ["system", "agent", "day"],
            defaultGroupBy: ["system"],
            filters: ["agentId", "systemId"],
          } satisfies ReportSectionConfig
        }
      />
    ),
  },
  {
    id: "collaboration",
    label: "Collaboration",
    permission: "reports:read",
    Component: ({ teamId }) => (
      <ReportSectionView
        teamId={teamId}
        cfg={
          {
            title: "Collaboration access",
            kind: "collaboration",
            groupBy: ["day", "surface", "reason", "person"],
            defaultGroupBy: ["day"],
            filters: [],
          } satisfies ReportSectionConfig
        }
      />
    ),
  },
  {
    id: "schedules",
    label: "Schedules",
    permission: "reports:read",
    Component: SchedulesTab,
  },
];
