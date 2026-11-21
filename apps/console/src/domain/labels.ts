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
    in_progress: "In progress",
    merged: "Merged",
    closed: "Closed",
    cancelled: "Cancelled",
  },
  slaState: { on_track: "On track", at_risk: "At risk", breached: "Breached" },
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
