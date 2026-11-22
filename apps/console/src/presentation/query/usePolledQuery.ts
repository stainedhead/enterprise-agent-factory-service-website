import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { PollPolicy } from "../../domain/status.js";
import { globalStatusOf } from "./globalStatus.js";
import type { QueryKey } from "./keys.js";

export interface PolledQueryOptions<T> {
  readonly queryKey: QueryKey;
  readonly queryFn: (ctx: { signal: AbortSignal }) => Promise<T>;
  /** Every status phase the page shows; one decision for all of them (WD-21). */
  readonly phasesOf: (data: T) => readonly string[];
  readonly enabled?: boolean;
}

const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * A query that polls while any shown phase is in flight (WEB-US-9.2..9.4): the interval comes from
 * `PollPolicy` over all the phases the page shows, stops on Ready/Failed, is 30 s for Degraded, makes
 * no request while the tab is hidden and refreshes once on return, and never goes faster than a
 * `Retry-After` after a 429 (WEB-US-9.5). The page issues one list request per interval, not one per row.
 */
export function usePolledQuery<T>(opts: PolledQueryOptions<T>): UseQueryResult<T> {
  const qc = useQueryClient();
  const status = globalStatusOf(qc);
  const startedAt = useRef(Date.now());
  const polling = useRef(false);

  const result = useQuery<T>({
    queryKey: opts.queryKey as unknown[],
    queryFn: opts.queryFn,
    enabled: opts.enabled ?? true,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data === undefined) {
        polling.current = false;
        return false;
      }
      status.tick();
      const input = {
        phases: opts.phasesOf(data),
        elapsedMs: Date.now() - startedAt.current,
        hidden: false,
        retryAfterSeconds: Math.ceil(status.remainingMs() / 1000),
      };
      // "Still polling" ignores visibility so the return from a hidden tab knows to refresh once.
      const d = PollPolicy.nextDelay(input);
      polling.current = d !== "stop";
      return d === "stop" || isHidden() ? false : d;
    },
  });

  // One refresh on return to a hidden tab, only for a page that was still polling.
  const refetch = result.refetch;
  const wasHidden = useRef(false);
  useEffect(() => {
    const onVis = () => {
      if (isHidden()) {
        wasHidden.current = true;
      } else if (wasHidden.current) {
        wasHidden.current = false;
        if (polling.current) void refetch();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refetch]);

  return result;
}
