import type { SessionChannelPort, SessionMessage } from "../../application/ports/auth.js";

const KNOWN: ReadonlySet<unknown> = new Set<SessionMessage>(["signout", "activity"]);

/**
 * Cross-tab messages over `BroadcastChannel("afs-session")`; a no-op where the API is missing. Only the
 * known messages are delivered, and each is the bare string: a message never carries data (FR-005).
 */
export class BroadcastSessionChannel implements SessionChannelPort {
  readonly #ch: BroadcastChannel | undefined;

  constructor(name = "afs-session") {
    this.#ch = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(name);
  }

  post(message: SessionMessage): void {
    this.#ch?.postMessage(message);
  }

  subscribe(handler: (message: SessionMessage) => void): () => void {
    const ch = this.#ch;
    if (!ch) return () => {};
    const on = (e: MessageEvent) => {
      if (KNOWN.has(e.data)) handler(e.data as SessionMessage);
    };
    ch.addEventListener("message", on);
    return () => ch.removeEventListener("message", on);
  }
}
