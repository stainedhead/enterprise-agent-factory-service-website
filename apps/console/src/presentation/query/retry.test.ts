import { describe, expect, it, vi } from "vitest";
import { AppError, type AppErrorKind } from "../../application/errors.js";
import { createQueryClient } from "./createQueryClient.js";

/** Requests a query sends against a port that always fails with `kind` (FR-015). */
async function requestsFor(kind: AppErrorKind): Promise<number> {
  const qc = createQueryClient(() => {});
  const port = vi.fn(() => Promise.reject(new AppError({ kind, message: kind })));
  await qc.fetchQuery({ queryKey: [kind], queryFn: port, retryDelay: 0 }).catch(() => {});
  return port.mock.calls.length;
}

describe("FR-015 query retries sit on top of the SDK's, not beside them", () => {
  it.each(["throttled", "unavailable", "network"] as const)("%s is requested once", async (k) => {
    expect(await requestsFor(k)).toBe(1);
  });

  it.each(["access-denied", "not-found", "unauthenticated", "validation", "stale"] as const)(
    "%s is requested once",
    async (k) => {
      expect(await requestsFor(k)).toBe(1);
    },
  );

  it.each(["unknown", "conflict"] as const)("%s is requested at most twice in total", async (k) => {
    expect(await requestsFor(k)).toBe(2);
  });
});
