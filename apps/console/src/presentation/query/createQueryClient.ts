import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { type AppError, isAppError } from "../../application/errors.js";

/**
 * The server-state cache (architecture §3.3). Any query or mutation that fails with `AccessDenied` is
 * reported once so the shell shows the alert and refreshes the caller (W-2). Nothing is persisted.
 */
export function createQueryClient(onAccessDenied: (e: AppError) => void): QueryClient {
  const report = (e: unknown) => {
    if (isAppError(e) && e.isAccessDenied) onAccessDenied(e);
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: report }),
    mutationCache: new MutationCache({ onError: report }),
    defaultOptions: {
      queries: {
        retry: (n, e) =>
          !(
            isAppError(e) &&
            ["access-denied", "not-found", "unauthenticated", "validation"].includes(e.kind)
          ) && n < 2,
        refetchOnWindowFocus: false,
        gcTime: 5 * 60_000,
      },
    },
  });
}
