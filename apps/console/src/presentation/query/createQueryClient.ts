import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { type AppError, isAppError } from "../../application/errors.js";
import { attachErrorReporter } from "./errorReporter.js";
import { attachGlobalStatus, GlobalStatus } from "./globalStatus.js";

/**
 * Never retried by a query: the answer will not change (first five), or the SDK already retried with its
 * own backoff and `Retry-After` and gave up (`throttled`, `unavailable`, `network`; FR-015). Retrying those
 * would multiply the requests (3 SDK attempts times 3 query attempts) and ignore `Retry-After`.
 */
const NO_RETRY = [
  "access-denied",
  "not-found",
  "unauthenticated",
  "validation",
  "stale",
  "throttled",
  "unavailable",
  "network",
];

export interface QueryClientOptions {
  /**
   * An API `401` that survived the SDK refresh (FR-003): called once, from a query, a cache mutation or a
   * bypass hook. `main/` wires it to `session.expire()`. Default: no-op.
   */
  readonly onUnauthenticated?: () => void;
}

/** True for a `409 team_suspended` (the API's `reason`). */
export const isTeamSuspended = (e: unknown): boolean =>
  isAppError(e) && e.kind === "conflict" && e.reason === "team_suspended";

/**
 * The server-state cache (architecture §3.3) with its global error routing (M1-Q1):
 * - `AccessDenied` is reported once so the shell shows the alert and refreshes the caller (W-2);
 * - `Unavailable` or a network failure after the retries raises "AFS is not responding" (cleared by the
 *   next success); open forms keep their non-secret values because nothing here resets them;
 * - `409 team_suspended` raises "Team is suspended";
 * - a throttled call suppresses polling for its `Retry-After`;
 * - an `Unauthenticated` call (after the SDK's one refresh) expires the session once and stops every query.
 * Every route goes through one reporter, also used by the bypass hooks (FR-002). Nothing is persisted.
 */
export function createQueryClient(
  onAccessDenied: (e: AppError) => void,
  status: GlobalStatus = new GlobalStatus(),
  options: QueryClientOptions = {},
): QueryClient {
  // assigned below; the reporter needs the client to stop its queries on expiry
  let client: QueryClient | undefined;
  const report = (e: unknown) => {
    if (!isAppError(e)) return;
    if (e.kind === "unauthenticated" && !status.sessionExpired) {
      status.setSessionExpired(true);
      // no query asks the API again while the session is expired (no retry storm)
      void client?.cancelQueries();
      options.onUnauthenticated?.();
    }
    if (e.isAccessDenied) onAccessDenied(e);
    if (e.kind === "unavailable" || e.kind === "network") status.setUnavailable(true);
    if (e.kind === "throttled") status.throttle(e.retryAfterSeconds);
    if (isTeamSuspended(e)) status.setTeamSuspended(true);
  };
  const qc = new QueryClient({
    queryCache: new QueryCache({
      onError: report,
      onSuccess: () => status.setUnavailable(false),
    }),
    mutationCache: new MutationCache({
      onError: report,
      onSuccess: () => {
        status.setUnavailable(false);
        status.announce("Change saved");
      },
    }),
    defaultOptions: {
      queries: {
        retry: (n, e) => !(isAppError(e) && NO_RETRY.includes(e.kind)) && n < 1,
        refetchOnWindowFocus: false,
        gcTime: 5 * 60_000,
      },
    },
  });
  client = qc;
  // While expired every observer's options resolve to `enabled: false`, even an explicit `enabled: true`,
  // so no mounted, invalidated or newly mounted query reaches the API.
  const resolve = qc.defaultQueryOptions.bind(qc);
  qc.defaultQueryOptions = ((o: Parameters<typeof resolve>[0]) => {
    const d = resolve(o);
    return status.sessionExpired ? { ...d, enabled: false } : d;
  }) as typeof qc.defaultQueryOptions;
  attachGlobalStatus(qc, status);
  attachErrorReporter(qc, report);
  return qc;
}
