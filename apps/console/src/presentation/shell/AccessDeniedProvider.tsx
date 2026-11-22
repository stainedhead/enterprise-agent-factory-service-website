import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { AppError } from "../../application/errors.js";
import { AccessDeniedContext, useShell } from "./ShellContext.js";

/** A one-way channel from the query cache (outside React) to the provider below. */
export interface AccessDeniedBus {
  emit(e: AppError): void;
  subscribe(fn: (e: AppError) => void): () => void;
}

export function createAccessDeniedBus(): AccessDeniedBus {
  const fns = new Set<(e: AppError) => void>();
  return {
    emit: (e) => {
      for (const f of [...fns]) f(e);
    },
    subscribe: (fn) => {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

/** Holds the latest access-denied error for the alert and refreshes the caller once per denial (W-2). */
export function AccessDeniedProvider({
  bus,
  children,
}: {
  bus: AccessDeniedBus;
  children: ReactNode;
}) {
  const { getMe } = useShell();
  const [error, setError] = useState<AppError | undefined>();
  const report = useCallback(
    (e: AppError) => {
      setError(e);
      void getMe.onAccessDenied();
    },
    [getMe],
  );
  useEffect(() => bus.subscribe(report), [bus, report]);
  const value = useMemo(
    () => ({ error, report, dismiss: () => setError(undefined) }),
    [error, report],
  );
  return <AccessDeniedContext.Provider value={value}>{children}</AccessDeniedContext.Provider>;
}
