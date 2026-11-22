import type { QueryClient } from "@tanstack/react-query";

/** Default suppression when a 429 carries no usable `Retry-After`. */
export const DEFAULT_THROTTLE_SECONDS = 10;

export interface GlobalStatusState {
  /** The API did not answer after the SDK's retries: "AFS is not responding". */
  readonly unavailable: boolean;
  /** A write raced a suspension: `409 team_suspended`. */
  readonly teamSuspended: boolean;
  /** Polling is suppressed until this time (ms epoch); 0 when not throttled. */
  readonly throttledUntil: number;
  /** The last change outcome for the polite live region ("Change saved"); empty until a write succeeds. */
  readonly announcement: string;
}

/**
 * Client-wide status the banners render and polling consults (WEB-US-9.5, NFR-4). One instance per
 * `QueryClient`; it also acts as the `ThrottleGate`.
 */
export class GlobalStatus {
  #state: GlobalStatusState = {
    unavailable: false,
    teamSuspended: false,
    throttledUntil: 0,
    announcement: "",
  };
  readonly #listeners = new Set<() => void>();

  constructor(private readonly now: () => number = Date.now) {}

  get state(): GlobalStatusState {
    return this.#state;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };

  getSnapshot = (): GlobalStatusState => this.#state;

  #set(patch: Partial<GlobalStatusState>): void {
    const next = { ...this.#state, ...patch };
    if (
      next.unavailable === this.#state.unavailable &&
      next.teamSuspended === this.#state.teamSuspended &&
      next.throttledUntil === this.#state.throttledUntil &&
      next.announcement === this.#state.announcement
    )
      return;
    this.#state = next;
    for (const f of [...this.#listeners]) f();
  }

  setUnavailable(v: boolean): void {
    this.#set({ unavailable: v });
  }
  setTeamSuspended(v: boolean): void {
    this.#set({ teamSuspended: v });
  }

  /**
   * Announces a change outcome through the shell's live region. The same message twice in a row alternates a
   * trailing full stop so a screen reader reads it again.
   */
  announce(message: string): void {
    const last = this.#state.announcement;
    this.#set({ announcement: last === message ? `${message}.` : message });
  }

  /** Any 429: suppress polling for `Retry-After` seconds (default 10). */
  throttle(retryAfterSeconds?: number): void {
    const s =
      retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : DEFAULT_THROTTLE_SECONDS;
    this.#set({ throttledUntil: this.now() + s * 1000 });
  }

  /** Milliseconds of suppression left. */
  remainingMs(): number {
    return Math.max(0, this.#state.throttledUntil - this.now());
  }

  /** Clears an elapsed throttle so the notice goes away. */
  tick(): void {
    if (this.#state.throttledUntil !== 0 && this.remainingMs() === 0)
      this.#set({ throttledUntil: 0 });
  }
}

const registry = new WeakMap<QueryClient, GlobalStatus>();

export function attachGlobalStatus(qc: QueryClient, status: GlobalStatus): void {
  registry.set(qc, status);
}

/** The status of a client; a client built without one gets an inert instance so hooks never branch. */
export function globalStatusOf(qc: QueryClient): GlobalStatus {
  let s = registry.get(qc);
  if (!s) {
    s = new GlobalStatus();
    registry.set(qc, s);
  }
  return s;
}
