import type { SessionChannelPort } from "../../application/ports/auth.js";

/** Cross-tab sign-out over `BroadcastChannel("afs-session")`; a no-op where the API is missing. */
export class BroadcastSessionChannel implements SessionChannelPort {
  readonly #ch: BroadcastChannel | undefined;

  constructor(name = "afs-session") {
    this.#ch = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(name);
  }

  post(message: "signout"): void {
    this.#ch?.postMessage(message);
  }

  subscribe(handler: (message: string) => void): () => void {
    const ch = this.#ch;
    if (!ch) return () => {};
    const on = (e: MessageEvent) => {
      if (typeof e.data === "string") handler(e.data);
    };
    ch.addEventListener("message", on);
    return () => ch.removeEventListener("message", on);
  }
}
