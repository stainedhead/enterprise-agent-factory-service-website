// Pure collaboration rules that remain in 1.1.0 (Paperclip change, orchestration change): link and condition
// states, the per-person aggregation of report rows, the key-rotation names and the managed-secret refusal
// texts. Exposure, tools, reasons and *Open <tool>* moved to `orchestration.ts`. No React, no SDK.

import { INVERTED_CONDITIONS } from "./orchestration.js";
import type { Dot, PhaseView } from "./status.js";

const LINK: Record<string, PhaseView> = {
  linked: { word: "linked", dot: "green" },
  pending: { word: "pending", dot: "amber" },
  failed: { word: "failed", dot: "red" },
  disabled: { word: "disabled", dot: "grey" },
};
/** A link state is a dot plus the contract's word; an unknown state passes through with a grey dot. */
export const linkStateView = (state: string): PhaseView =>
  LINK[state] ?? { word: state, dot: "grey" };

/** A worker that is not connected reads *Not connected* in the agents list. */
export const NOT_CONNECTED: PhaseView = { word: "Not connected", dot: "grey" };

export interface ConditionLike {
  readonly type: string;
  readonly status: string;
  readonly reason?: string | undefined;
  readonly message?: string | undefined;
}

/** `UnmanagedToolAgents` and `ToolChanging` are inverted: `False` is healthy. `Unknown` is amber. */
export function conditionView(c: ConditionLike): { word: string; dot: Dot } {
  const word = c.status === "True" || c.status === "False" ? c.status : "Unknown";
  if (word === "Unknown") return { word, dot: "amber" };
  const inverted = INVERTED_CONDITIONS.includes(c.type);
  const healthy = inverted ? word === "False" : word === "True";
  return { word, dot: healthy ? "green" : "red" };
}

export interface AccessRow {
  readonly principal?:
    | {
        readonly id: string;
        readonly type?: string | undefined;
        readonly name?: string | undefined;
      }
    | undefined;
  readonly signIns?: number | undefined;
  readonly requests?: number | undefined;
  readonly deniedRequests?: number | undefined;
  readonly serviceAdminEntry?: boolean | undefined;
}

export interface PersonAccess {
  readonly id: string;
  readonly label: string;
  readonly signIns: number;
  readonly requests: number;
  readonly deniedRequests: number;
  readonly serviceAdminEntry: boolean;
}

/** Sums the day rows per person, sorts by requests descending and keeps the top `limit` (WEB-US-49). */
export function aggregatePeople(rows: readonly AccessRow[], limit = 10): PersonAccess[] {
  const by = new Map<string, PersonAccess>();
  for (const r of rows) {
    if (!r.principal) continue;
    const p = r.principal;
    const label = (p.name ?? p.id) + (p.type === "api_key" ? " (API key)" : "");
    const cur = by.get(p.id);
    by.set(p.id, {
      id: p.id,
      label,
      signIns: (cur?.signIns ?? 0) + (r.signIns ?? 0),
      requests: (cur?.requests ?? 0) + (r.requests ?? 0),
      deniedRequests: (cur?.deniedRequests ?? 0) + (r.deniedRequests ?? 0),
      serviceAdminEntry: (cur?.serviceAdminEntry ?? false) || r.serviceAdminEntry === true,
    });
  }
  return [...by.values()].sort((a, b) => b.requests - a.requests).slice(0, limit);
}

/** The names the *Rotate Paperclip keys* dialog lists (WEB-US-50). */
export const ROTATABLE_KEYS = [
  "paperclip-better-auth-secret",
  "paperclip-tool-action-signing-secret",
] as const;
export const MASTER_KEY = "paperclip-secrets-master-key";
export const MASTER_KEY_TEXT =
  "Cannot be rotated: Paperclip could no longer decrypt its stored identities";

/** The text for the API's managed-secret refusals when a request is forced (WEB-US-54); `undefined` for any other reason. */
export function managedRefusalText(
  reason: string | undefined,
  managedBy?: string,
): string | undefined {
  if (reason === "managed_secret")
    return `This secret is managed by ${managedBy === "paperclip" ? "Paperclip" : "AFS"} and cannot be changed here`;
  if (reason === "master_key_not_rotatable") return MASTER_KEY_TEXT;
  return undefined;
}
