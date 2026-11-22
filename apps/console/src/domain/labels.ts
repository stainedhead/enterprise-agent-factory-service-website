// One table for enum → label; an unknown value renders as its raw text, never an error (SDK-10).
const TABLES = {
  roleLinkStatus: {
    pending_trust: "Pending trust",
    verified: "Verified",
    failed: "Failed",
    disabled: "Disabled",
  },
  workOrderStatus: {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In progress",
    pr_opened: "PR opened",
    done: "Done",
    failed: "Failed",
    merged: "Merged",
    closed: "Closed",
    cancelled: "Cancelled",
  },
  slaState: {
    on_track: "On track",
    due_soon: "Due soon",
    at_risk: "At risk",
    breached: "Breached",
    met: "Met",
    missed: "Missed",
  },
  severity: { critical: "Critical", high: "High", medium: "Medium", low: "Low" },
  repoStatus: {
    pending: "Pending",
    in_progress: "In progress",
    pr_opened: "PR opened",
    merged: "Merged",
    not_affected: "Not affected",
    failed: "Failed",
    skipped: "Skipped",
  },
  exportStatus: {
    pending: "Pending",
    running: "Running",
    ready: "Ready",
    failed: "Failed",
    expired: "Expired",
  },
  scheduleStatus: { ok: "OK", failed: "Failed", never: "Never run" },
  teamKind: { persistent: "Persistent", ephemeral: "Ephemeral" },
  isolationTier: { shared: "Shared", dedicated: "Dedicated" },
} as const;

export type LabelGroup = keyof typeof TABLES;

export function label(group: LabelGroup, value: string): string {
  const table = TABLES[group] as Record<string, string>;
  return table[value] ?? value;
}
