import type { RetryOptions } from "./types.js";

export interface ResolvedRetry {
  maxRetries: number;
  baseMs: number;
  capMs: number;
  maxRetryAfterSeconds: number;
  random: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Sleeps `ms`, rejecting with an AbortError as soon as `signal` aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

export function resolveRetry(o: RetryOptions | undefined): ResolvedRetry {
  return {
    maxRetries: o?.maxRetries ?? 3,
    baseMs: o?.baseMs ?? 200,
    capMs: o?.capMs ?? 5000,
    maxRetryAfterSeconds: o?.maxRetryAfterSeconds ?? 30,
    random: o?.random ?? Math.random,
    sleep: o?.sleep ?? abortableSleep,
  };
}

/** Full jitter: random(0, min(cap, base * 2^n)) (AWS "Exponential backoff and jitter"). */
export function backoffMs(r: ResolvedRetry, retryIndex: number): number {
  return Math.floor(r.random() * Math.min(r.capMs, r.baseMs * 2 ** retryIndex));
}
