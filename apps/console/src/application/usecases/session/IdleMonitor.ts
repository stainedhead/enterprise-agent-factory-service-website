import type { ClockPort, SessionChannelPort } from "../../ports/auth.js";

/** At most one `activity` message per this many milliseconds (FR-005). */
export const ACTIVITY_THROTTLE_MS = 30_000;

/**
 * Signs the user out after `minutes` without input in any tab (WEB-US-7.9). `touch()` is called on user
 * input in this tab. When a session channel is given, a throttled `activity` message (no payload) resets
 * the monitor of every other tab, so a tab left open in the background does not sign out the tab the
 * user is working in. Idle sign-out therefore happens only when no tab had input for the configured time.
 * A remote reset can lag the real input by up to the throttle period (30 s).
 */
export class IdleMonitor {
  #timer: unknown;
  #stopped = true;
  #lastPost: number | undefined;
  #unsubscribe: (() => void) | undefined;

  constructor(
    private readonly clock: ClockPort,
    private readonly minutes: number,
    private readonly onIdle: () => void,
    private readonly channel?: SessionChannelPort,
  ) {}

  start(): void {
    this.#stopped = false;
    this.#unsubscribe ??= this.channel?.subscribe((m) => {
      if (m === "activity") this.#reset();
    });
    this.#reset();
  }

  /** User input in this tab: resets the timer and, at most every 30 s, tells the other tabs. */
  touch(): void {
    if (this.#stopped) return;
    this.#reset();
    const now = this.clock.now();
    if (
      this.channel &&
      (this.#lastPost === undefined || now - this.#lastPost >= ACTIVITY_THROTTLE_MS)
    ) {
      this.#lastPost = now;
      this.channel.post("activity");
    }
  }

  stop(): void {
    this.#stopped = true;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (this.#timer !== undefined) this.clock.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #reset(): void {
    if (this.#stopped) return;
    if (this.#timer !== undefined) this.clock.clearTimeout(this.#timer);
    this.#timer = this.clock.setTimeout(() => {
      this.#timer = undefined;
      this.stop();
      this.onIdle();
    }, this.minutes * 60_000);
  }
}
