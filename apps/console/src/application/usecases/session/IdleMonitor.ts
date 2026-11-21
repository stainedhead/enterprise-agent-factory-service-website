import type { ClockPort } from "../../ports/auth.js";

/** Signs the user out after `minutes` without input (WEB-US-7.8). `touch()` is called on user activity. */
export class IdleMonitor {
  #timer: unknown;
  #stopped = true;

  constructor(
    private readonly clock: ClockPort,
    private readonly minutes: number,
    private readonly onIdle: () => void,
  ) {}

  start(): void {
    this.#stopped = false;
    this.touch();
  }

  touch(): void {
    if (this.#stopped) return;
    if (this.#timer !== undefined) this.clock.clearTimeout(this.#timer);
    this.#timer = this.clock.setTimeout(() => {
      this.#stopped = true;
      this.#timer = undefined;
      this.onIdle();
    }, this.minutes * 60_000);
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer !== undefined) this.clock.clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
