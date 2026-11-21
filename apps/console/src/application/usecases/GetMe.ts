import type { Me } from "../../domain/me.js";
import type { ClockPort } from "../ports/auth.js";
import type { MePort } from "../ports/me.js";

/** Five minutes: `GetMe` is re-fetched on window focus only when older than this (W-2). */
export const ME_STALE_MS = 5 * 60_000;

/**
 * The caller's identity. Fetched at sign-in, again on window focus once stale, and after any
 * `AccessDenied` (the permission may have changed, W-2). The latest value is kept for synchronous reads.
 */
export class GetMe {
  #me: Me | undefined;
  #at = 0;
  #inflight: Promise<Me> | undefined;
  readonly #listeners = new Set<(me: Me | undefined) => void>();

  constructor(
    private readonly port: MePort,
    private readonly clock: Pick<ClockPort, "now">,
    private readonly staleMs = ME_STALE_MS,
  ) {}

  get current(): Me | undefined {
    return this.#me;
  }

  onChange(fn: (me: Me | undefined) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Fetches unless a fresh value is held; `force` always fetches. Concurrent calls share one request. */
  execute(opts: { force?: boolean } = {}): Promise<Me> {
    if (!opts.force && this.#me && this.clock.now() - this.#at < this.staleMs)
      return Promise.resolve(this.#me);
    this.#inflight ??= this.port
      .get()
      .then((me) => {
        this.#me = me;
        this.#at = this.clock.now();
        for (const fn of [...this.#listeners]) fn(me);
        return me;
      })
      .finally(() => {
        this.#inflight = undefined;
      });
    return this.#inflight;
  }

  /** Window focus: refresh only when stale; failures keep the held value. */
  async onFocus(): Promise<void> {
    if (!this.#me || this.clock.now() - this.#at < this.staleMs) return;
    await this.execute({ force: true }).catch(() => {});
  }

  /** After an `AccessDenied` the permissions may have changed; failures keep the held value. */
  async onAccessDenied(): Promise<void> {
    await this.execute({ force: true }).catch(() => {});
  }

  clear(): void {
    this.#me = undefined;
    this.#at = 0;
    for (const fn of [...this.#listeners]) fn(undefined);
  }
}
