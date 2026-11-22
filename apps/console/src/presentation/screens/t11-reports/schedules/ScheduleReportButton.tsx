import { useState } from "react";
import type { ScheduledKind } from "../../../../application/ports/reportSchedules.js";
import type { ReportQuery } from "../../../../application/ports/reports.js";
import { Button } from "../../../components/index.js";
import { gate } from "../../../hooks/gate.js";
import { useMe } from "../../../shell/ShellContext.js";
import { ScheduleDialog } from "./ScheduleDialog.js";

/** *Schedule report* for a report tab (WEB-US-37.6, 37.7): team-admins only, disabled with the role for others. */
export function ScheduleReportButton({
  teamId,
  kind,
  title,
  query,
}: {
  teamId: string;
  kind: ScheduledKind;
  title: string;
  query: ReportQuery;
}) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <Button disabledReason={gate(me, "reports:schedule", teamId)} onClick={() => setOpen(true)}>
        Schedule report
      </Button>
      {done && <span role="status"> Scheduled. See the Schedules tab.</span>}
      {open && (
        <ScheduleDialog
          teamId={teamId}
          kind={kind}
          title={title}
          query={query}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setDone(true);
          }}
        />
      )}
    </>
  );
}
