import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { Alert } from "../components/Alert.js";
import { LiveRegion } from "../components/LiveRegion.js";
import { globalStatusOf } from "../query/globalStatus.js";

/**
 * The page-level notices fed by the query layer (M1-Q1, M1-Q4): "AFS is not responding" with *Retry*,
 * "Team is suspended", and the non-blocking "Slowing down". Forms stay mounted, so their values survive.
 */
export function GlobalBanners() {
  const qc = useQueryClient();
  const status = globalStatusOf(qc);
  const st = useSyncExternalStore(status.subscribe, status.getSnapshot, status.getSnapshot);
  const throttled = st.throttledUntil > 0;

  useEffect(() => {
    if (!throttled) return;
    const id = setTimeout(() => status.tick(), status.remainingMs() + 50);
    return () => clearTimeout(id);
  }, [throttled, status]);

  return (
    <>
      <LiveRegion message={st.announcement} />
      {st.unavailable && (
        <Alert
          kind="error"
          title="AFS is not responding"
          action={{
            label: "Retry",
            onClick: () => {
              void qc.invalidateQueries();
              status.setUnavailable(false);
            },
          }}
        >
          Your changes on this page are kept. Retry when the service is back.
        </Alert>
      )}
      {st.teamSuspended && (
        <Alert
          kind="warning"
          title="Team is suspended"
          onDismiss={() => status.setTeamSuspended(false)}
        >
          Changes are blocked until the team is resumed.
        </Alert>
      )}
      {throttled && (
        <Alert kind="info" title="Slowing down">
          Requests are being throttled; automatic refresh is paused for a moment.
        </Alert>
      )}
    </>
  );
}
