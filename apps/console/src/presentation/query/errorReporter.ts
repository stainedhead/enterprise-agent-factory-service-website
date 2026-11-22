import type { QueryClient } from "@tanstack/react-query";
import { QueryClientContext } from "@tanstack/react-query";
import { useContext } from "react";

/**
 * The one place a failed call is routed to the shell (FR-002, FR-003): `AccessDenied` shows the alert and
 * refreshes the caller, `Unauthenticated` expires the session, `Unavailable` / `Throttled` / a suspended
 * team raise the global notices. It takes only the error: never the variables, never a secret.
 */
export type ErrorReporter = (e: unknown) => void;

const registry = new WeakMap<QueryClient, ErrorReporter>();

/** Registers the reporter `createQueryClient` built for `qc`. */
export function attachErrorReporter(qc: QueryClient, report: ErrorReporter): void {
  registry.set(qc, report);
}

/** The reporter of a client; a no-op for a client built without one. */
export function errorReporterOf(qc: QueryClient | undefined): ErrorReporter {
  return (qc && registry.get(qc)) || (() => {});
}

/**
 * The reporter for the bypass hooks (`useSecretMutation`, `useVersionedForm`), which deliberately skip the
 * query and mutation caches. Outside a `QueryClientProvider` it is a no-op, so the hooks stay usable alone.
 */
export function useErrorReporter(): ErrorReporter {
  return errorReporterOf(useContext(QueryClientContext));
}
