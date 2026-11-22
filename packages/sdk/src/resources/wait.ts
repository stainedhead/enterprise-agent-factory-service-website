/** The status shape `waitFor` reads: what `GetTeamStatus`, `GetAgentStatus` and friends return. */
export interface WaitStatus {
  readonly generation: number;
  readonly status: {
    readonly phase: string;
    readonly observedGeneration: number;
    readonly [k: string]: unknown;
  };
  readonly [k: string]: unknown;
}

/** A resource's status getter, or an object that has one (`teams(core)` style namespaces bound to an id). */
export type WaitTarget =
  | ((opts: { signal?: AbortSignal }) => Promise<WaitStatus>)
  | { getStatus(opts?: { signal?: AbortSignal }): Promise<WaitStatus> };

/** Options of {@link waitFor}. */
export interface WaitOptions {
  /** Phases that end the wait. Default `["Ready"]`. */
  until?: readonly string[];
  /** Give up after this long; default 10 minutes. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Injected for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

/** Why a wait ended without reaching its target. */
export type WaitFailure = "failed" | "degraded" | "timeout" | "aborted";

/** Rejection of {@link waitFor}; `status` is the last observed status (absent before the first read). */
export class WaitError extends Error {
  readonly reason: WaitFailure;
  readonly status: WaitStatus | undefined;

  constructor(reason: WaitFailure, message: string, status?: WaitStatus) {
    super(message);
    this.name = "WaitError";
    this.reason = reason;
    this.status = status;
  }
}

const FAST_MS = 5_000;
const SLOW_MS = 30_000;
const FAST_WINDOW_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 600_000;

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

/**
 * Polls a resource's status until it reaches a target phase (every 5 s for two minutes, then every
 * 30 s). Resolves with the status once the phase is in `until` and `observedGeneration >= generation`.
 * Rejects with a {@link WaitError} on `Failed`, on `Degraded` unless targeted (both only once
 * `observedGeneration >= generation`, so a stale status keeps the wait going), on `timeoutMs` and on abort.
 */
export async function waitFor(target: WaitTarget, opts: WaitOptions = {}): Promise<WaitStatus> {
  const until = opts.until ?? ["Ready"];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const get =
    typeof target === "function" ? target : (o: { signal?: AbortSignal }) => target.getStatus(o);
  const start = now();
  let last: WaitStatus | undefined;

  for (;;) {
    if (opts.signal?.aborted) throw new WaitError("aborted", "The wait was aborted", last);
    last = await get(opts.signal ? { signal: opts.signal } : {});
    const phase = last.status.phase;
    const applied = last.status.observedGeneration >= last.generation;
    if (until.includes(phase) && applied) return last;
    // A Failed or Degraded status older than the latest change is stale: keep waiting for the reconciler.
    if (phase === "Failed" && applied && !until.includes("Failed"))
      throw new WaitError("failed", "The resource reached Failed", last);
    if (phase === "Degraded" && applied && !until.includes("Degraded"))
      throw new WaitError("degraded", "The resource is Degraded", last);
    const elapsed = now() - start;
    if (elapsed >= timeoutMs)
      throw new WaitError("timeout", `Timed out after ${timeoutMs} ms in ${phase}`, last);
    const step = elapsed < FAST_WINDOW_MS ? FAST_MS : SLOW_MS;
    await sleep(Math.min(step, Math.max(0, timeoutMs - elapsed)), opts.signal);
  }
}
