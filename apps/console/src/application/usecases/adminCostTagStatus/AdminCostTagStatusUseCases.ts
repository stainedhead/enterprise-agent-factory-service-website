import type { AdminCostTagStatusPort, CostTagStatusItem } from "../../ports/adminCostTagStatus.js";

/** A key not seen in the Cost and Usage Report this many days after AWS activation is flagged. */
export const UNSEEN_DAYS = 3;
const DAY_MS = 86_400_000;

export type TagFlag = "ok" | "not-seen" | "not-active";

/**
 * The flag for one key. An active key last seen more than {@link UNSEEN_DAYS} days before the check (or never
 * seen) is `not-seen`; a key AWS does not report as active is `not-active`. The API gives no activation time
 * (CQ-24), so "days after activation" is measured from the last sighting, or flagged outright when never seen.
 */
export function flagFor(t: CostTagStatusItem): TagFlag {
  if (t.awsStatus !== "active") return "not-active";
  if (t.seenInCur) return "ok";
  const checked = Date.parse(t.checkedAt);
  const last = t.lastSeenAt ? Date.parse(t.lastSeenAt) : Number.NaN;
  if (Number.isNaN(last) || Number.isNaN(checked)) return "not-seen";
  return checked - last >= UNSEEN_DAYS * DAY_MS ? "not-seen" : "ok";
}

/** Use cases for S9 *Tag status*. */
export class AdminCostTagStatusUseCases {
  constructor(private readonly port: AdminCostTagStatusPort) {}
  list(signal?: AbortSignal): Promise<readonly CostTagStatusItem[]> {
    return this.port.list(signal);
  }
}
