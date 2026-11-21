import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AppError, isAppError } from "../../application/errors.js";
import { hasNoAccess } from "../../domain/me.js";
import { NoAccessPage, NotRespondingPage } from "./pages.js";
import { MeProvider, useCurrentMe, useShell } from "./ShellContext.js";

/**
 * Loads the caller at sign-in (W-2) and refreshes on window focus once stale. A failure at boot shows
 * the full-page "AFS is not responding"; a principal with no access sees "No access yet" and the
 * console makes no further calls for them (CD-10).
 */
export function MeGate({ children }: { children: ReactNode }) {
  const { getMe, signOut } = useShell();
  const me = useCurrentMe(getMe);
  const [error, setError] = useState<AppError | undefined>();

  const load = useCallback(() => {
    setError(undefined);
    getMe
      .execute()
      .catch((e: unknown) =>
        setError(
          isAppError(e) ? e : new AppError({ kind: "unknown", message: "Unexpected error" }),
        ),
      );
  }, [getMe]);

  useEffect(load, [load]);
  useEffect(() => {
    const onFocus = () => void getMe.onFocus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [getMe]);

  if (error) return <NotRespondingPage error={error} onRetry={load} />;
  if (!me)
    return (
      <p role="status" style={{ padding: 24 }}>
        Loading…
      </p>
    );
  if (hasNoAccess(me)) return <NoAccessPage onSignOut={() => void signOut.execute()} />;
  return <MeProvider value={me}>{children}</MeProvider>;
}
