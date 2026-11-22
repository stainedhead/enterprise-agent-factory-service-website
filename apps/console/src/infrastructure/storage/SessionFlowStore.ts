import { AuthError, type DraftPersistPort } from "../../application/ports/auth.js";

/** One in-flight authorization request: PKCE verifier, nonce and where to return. No token is ever here. */
export interface PendingFlow {
  readonly verifier: string;
  readonly nonce: string;
  readonly redirectUri: string;
  readonly returnTo: string;
  readonly provider: {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly issuerUrl: string;
    readonly consoleClientId: string;
    readonly isDefault: boolean;
  };
  /** Epoch ms when the flow began; `put` uses it to expire abandoned flows (FR-012). */
  readonly createdAt: number;
}

export interface FlowStore {
  /** Remembers a flow. Throws {@link AuthError} (`storage`) when browser storage is unavailable. */
  put(state: string, flow: PendingFlow): void;
  /** Returns and forgets the flow: a state value is single use. */
  take(state: string): PendingFlow | undefined;
  /** Forgets a flow that will never complete (a renewal that timed out). */
  discard(state: string): void;
}

/** A flow older than this is abandoned: `put` removes it. */
export const FLOW_MAX_AGE_MS = 10 * 60_000;
/** At most this many flows are kept, the newest ones. */
export const FLOW_MAX_ENTRIES = 5;

const PREFIX = "afs.flow.";

function readCreatedAt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  try {
    const v = (JSON.parse(raw) as { createdAt?: unknown }).createdAt;
    return typeof v === "number" ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Holds a pending flow in `sessionStorage` between the redirect out and the callback. */
export class SessionFlowStore implements FlowStore {
  constructor(private readonly store: () => Storage = () => globalThis.sessionStorage) {}

  put(state: string, flow: PendingFlow): void {
    try {
      const s = this.store();
      // Prune against the new flow's own clock: drop unreadable and expired flows, then the oldest
      // ones so that with the new flow there are at most FLOW_MAX_ENTRIES.
      const keep: { key: string; createdAt: number }[] = [];
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
      for (const key of keys) {
        const createdAt = readCreatedAt(s.getItem(key));
        if (createdAt === undefined || flow.createdAt - createdAt > FLOW_MAX_AGE_MS)
          s.removeItem(key);
        else keep.push({ key, createdAt });
      }
      keep.sort((a, b) => a.createdAt - b.createdAt);
      for (const old of keep.slice(0, Math.max(0, keep.length - (FLOW_MAX_ENTRIES - 1))))
        s.removeItem(old.key);
      s.setItem(PREFIX + state, JSON.stringify(flow));
    } catch {
      throw new AuthError(
        "storage",
        "Browser storage is required for sign-in. Allow site data for this page and try again.",
      );
    }
  }

  discard(state: string): void {
    try {
      this.store().removeItem(PREFIX + state);
    } catch {
      // nothing to forget
    }
  }

  take(state: string): PendingFlow | undefined {
    let raw: string | null;
    try {
      const s = this.store();
      raw = s.getItem(PREFIX + state);
      s.removeItem(PREFIX + state);
    } catch {
      return undefined;
    }
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as PendingFlow;
    } catch {
      return undefined;
    }
  }
}

const DRAFTS = "afs.drafts";

/** Non-secret form drafts carried across a top-level re-authentication redirect (DV-9). */
export class SessionDraftStorage implements DraftPersistPort {
  constructor(private readonly store: () => Storage = () => globalThis.sessionStorage) {}

  write(snapshot: Record<string, Record<string, string>>): void {
    try {
      this.store().setItem(DRAFTS, JSON.stringify(snapshot));
    } catch {
      // best effort
    }
  }

  /** Removes the drafts (sign-out). */
  clear(): void {
    try {
      this.store().removeItem(DRAFTS);
    } catch {
      // best effort
    }
  }

  /** Reads and removes the drafts. */
  take(): Record<string, Record<string, string>> {
    try {
      const s = this.store();
      const raw = s.getItem(DRAFTS);
      s.removeItem(DRAFTS);
      return raw ? (JSON.parse(raw) as Record<string, Record<string, string>>) : {};
    } catch {
      return {};
    }
  }
}
