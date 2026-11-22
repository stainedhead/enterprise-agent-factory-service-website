import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { type AppError, isAppError } from "../../application/errors.js";
import { attachGlobalStatus, GlobalStatus } from "./globalStatus.js";

const NO_RETRY = ["access-denied", "not-found", "unauthenticated", "validation", "stale"];

/** True for a `409 team_suspended` (the API's `reason`). */
export const isTeamSuspended = (e: unknown): boolean =>
  isAppError(e) && e.kind === "conflict" && e.reason === "team_suspended";

/**
 * The server-state cache (architecture §3.3) with its global error routing (M1-Q1):
 * - `AccessDenied` is reported once so the shell shows the alert and refreshes the caller (W-2);
 * - `Unavailable` or a network failure after the retries raises "AFS is not responding" (cleared by the
 *   next success); open forms keep their non-secret values because nothing here resets them;
 * - `409 team_suspended` raises "Team is suspended";
 * - a throttled call suppresses polling for its `Retry-After`.
 * Nothing is persisted.
 */
export function createQueryClient(
  onAccessDenied: (e: AppError) => void,
  status: GlobalStatus = new GlobalStatus(),
): QueryClient {
  const report = (e: unknown) => {
    if (!isAppError(e)) return;
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
      onSuccess: () => status.setUnavailable(false),
    }),
    defaultOptions: {
      queries: {
        retry: (n, e) => !(isAppError(e) && NO_RETRY.includes(e.kind)) && n < 2,
        refetchOnWindowFocus: false,
        gcTime: 5 * 60_000,
      },
    },
  });
  attachGlobalStatus(qc, status);
  return qc;
}
