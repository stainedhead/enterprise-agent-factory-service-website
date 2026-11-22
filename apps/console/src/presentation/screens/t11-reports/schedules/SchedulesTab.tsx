import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../application/errors.js";
import type { ReportScheduleRecord } from "../../../../application/ports/reportSchedules.js";
import { formatLocal, utcTitle } from "../../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  StatusIndicator,
  Table,
} from "../../../components/index.js";
import { gate } from "../../../hooks/gate.js";
import { queryKey } from "../../../query/keys.js";
import { useOptionalService, useService } from "../../../services.js";
import { useMe } from "../../../shell/ShellContext.js";

const time = (t: string | undefined) =>
  t ? (
    <time dateTime={t} title={utcTitle(t)}>
      {formatLocal(t)}
    </time>
  ) : (
    "—"
  );

/** *Schedules*: the team's report schedules with their next run, last run and last status with its error. */
export function SchedulesTab({ teamId }: { teamId: string }) {
  const schedules = useService("reportSchedules");
  const notifications = useOptionalService("notifications");
  const me = useMe();
  const reason = gate(me, "reports:schedule", teamId);
  const qc = useQueryClient();
  const key = queryKey({ area: "report-schedules", teamId, resource: "list" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => schedules.list(teamId, signal) });
  const channels = useQuery({
    queryKey: queryKey({ area: "notifications", teamId, resource: "channels" }),
    queryFn: ({ signal }) =>
      notifications ? notifications.list(teamId, signal) : Promise.reject(new Error("no channels")),
    enabled: notifications !== undefined,
    retry: false,
  });
  const channelName = (id: string) => channels.data?.find((c) => c.id === id)?.name ?? id;
  const [removing, setRemoving] = useState<ReportScheduleRecord>();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (s: ReportScheduleRecord) => schedules.setEnabled(teamId, s, !s.enabled),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (s: ReportScheduleRecord) => schedules.delete(teamId, s),
    onSettled: () => {
      setRemoving(undefined);
      void refresh();
    },
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);

  return (
    <Card title="Report schedules">
      <p>
        Scheduled reports are sent as CSV to the team's notification channels. Schedule one from the
        report's own tab.
      </p>
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The change was not applied"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Table
        id={`report-schedules-${teamId}`}
        caption="Report schedules"
        filterLabel="Find schedules"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No scheduled reports yet."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (s: ReportScheduleRecord) => s.name,
            text: (s) => s.name,
            cell: (s) => s.name,
          },
          { id: "report", header: "Report", text: (s) => s.report, cell: (s) => s.report },
          { id: "cadence", header: "Cadence", text: (s) => s.cadence, cell: (s) => s.cadence },
          {
            id: "channel",
            header: "Channel",
            text: (s) => channelName(s.channelId),
            cell: (s) => channelName(s.channelId),
          },
          {
            id: "state",
            header: "State",
            text: (s) => (s.enabled ? "Enabled" : "Paused"),
            cell: (s) => (s.enabled ? "Enabled" : "Paused"),
          },
          {
            id: "next",
            header: "Next run",
            text: (s) => s.nextRunAt ?? "",
            cell: (s) => time(s.nextRunAt),
          },
          {
            id: "last",
            header: "Last run",
            text: (s) => s.lastRunAt ?? "",
            cell: (s) => time(s.lastRunAt),
          },
          {
            id: "status",
            header: "Last status",
            text: (s) => s.lastStatus ?? "",
            cell: (s) =>
              !s.lastStatus ? (
                "—"
              ) : (
                <>
                  <StatusIndicator
                    view={
                      s.lastStatus === "succeeded"
                        ? { word: "Succeeded", dot: "green" }
                        : { word: "Failed", dot: "red" }
                    }
                  />
                  {s.lastStatus === "failed" && s.lastError && (
                    <div role="alert">{s.lastError}</div>
                  )}
                </>
              ),
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (s) => (
              <>
                <Button
                  aria-label={`${s.enabled ? "Pause" : "Resume"} ${s.name}`}
                  disabledReason={reason}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(s)}
                >
                  {s.enabled ? "Pause" : "Resume"}
                </Button>{" "}
                <Button
                  aria-label={`Delete ${s.name}`}
                  disabledReason={reason}
                  onClick={() => setRemoving(s)}
                >
                  Delete
                </Button>
              </>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(s) => s.id}
      />
      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}`}
          confirmLabel="Delete"
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => del.mutate(removing)}
        >
          <p>The report is no longer sent on its schedule.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
