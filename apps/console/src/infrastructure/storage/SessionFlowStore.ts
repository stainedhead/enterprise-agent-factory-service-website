import type { DraftPersistPort } from "../../application/ports/auth.js";

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
}

export interface FlowStore {
  put(state: string, flow: PendingFlow): void;
  /** Returns and forgets the flow: a state value is single use. */
  take(state: string): PendingFlow | undefined;
}

const PREFIX = "afs.flow.";

/** Holds a pending flow in `sessionStorage` between the redirect out and the callback. */
export class SessionFlowStore implements FlowStore {
  constructor(private readonly store: () => Storage = () => globalThis.sessionStorage) {}

  put(state: string, flow: PendingFlow): void {
    this.store().setItem(PREFIX + state, JSON.stringify(flow));
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
