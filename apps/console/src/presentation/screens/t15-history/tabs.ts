// Shared list: the sections of T15 in tab order. M4 adds restore inside the revisions section, not here.
import type { ComponentType } from "react";
import type { Permission } from "../../../domain/permission.js";
import { AuditTab } from "./tabs/audit/AuditTab.js";
import { RevisionsTab } from "./tabs/revisions/RevisionsTab.js";

export interface HistorySection {
  /** The last path segment of `/t/:teamId/history/<id>`. */
  readonly id: string;
  readonly label: string;
  readonly permission: Permission;
  readonly Component: ComponentType<{ teamId: string }>;
}

export const sections: readonly HistorySection[] = [
  { id: "audit", label: "Activity & audit", permission: "audit:read", Component: AuditTab },
  {
    id: "revisions",
    label: "Config revisions",
    permission: "revisions:read",
    Component: RevisionsTab,
  },
];
