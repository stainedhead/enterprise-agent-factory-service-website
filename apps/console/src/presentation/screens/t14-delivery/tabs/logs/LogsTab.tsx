import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { LogDestinationFull } from "../../../../../application/ports/logDestinations.js";
import { logDeliveryWord } from "../../../../../application/usecases/logDestinations/LogDestinationsUseCases.js";
import { formatLocal, utcTitle } from "../../../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  StatusIndicator,
  Table,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { DestinationDialog, LOG_KINDS } from "./DestinationDialog.js";

const VIEW = {
  Failing: { word: "Failing", dot: "red" },
  Delivering: { word: "Delivering", dot: "green" },
  "Not yet used": { word: "Not yet used", dot: "grey" },
} as const;

const kindLabel = (k: string) => LOG_KINDS.find((x) => x.value === k)?.label ?? k;

/**
 * *Log delivery* (WEB-US-34.1, 34.5): where the team's agent logs are delivered, with the destination's status
 * and last delivery. Credentials are secret references, never typed. The API decides who may change them.
 */
export function LogsTab({ teamId }: { teamId: string }) {
  const logs = useService("logDestinations");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("logs:write");
  const key = queryKey({ area: "log-destinations", teamId, resource: "list" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => logs.list(teamId, signal) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [dialog, setDialog] = useState<
    { kind: "edit"; d?: LogDestinationFull } | { kind: "delete"; d: LogDestinationFull } | undefined
  >();
  const toggle = useMutation({
    mutationFn: (d: LogDestinationFull) => logs.update(teamId, d, { enabled: !d.enabled }),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (d: LogDestinationFull) => logs.delete(teamId, d),
    onSettled: () => {
      setDialog(undefined);
      void refresh();
    },
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);

  return (
    <Card title="Log delivery">
      <p>
        Where this team's agent logs are delivered. Credentials are held as secrets, never here.
      </p>
      <div style={{ marginBottom: 12 }}>
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "edit" })}
        >
          Add destination
        </Button>
      </div>
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
        id={`log-destinations-${teamId}`}
        caption="Log destinations"
        filterLabel="Find destinations"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No log destinations yet."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (d) => d.name,
            text: (d) => d.name,
            cell: (d) => d.name,
          },
          {
            id: "kind",
            header: "Kind",
            sortValue: (d) => d.kind,
            text: (d) => kindLabel(d.kind),
            cell: (d) => kindLabel(d.kind),
          },
          {
            id: "enabled",
            header: "State",
            text: (d) => (d.enabled ? "Enabled" : "Disabled"),
            cell: (d) => (d.enabled ? "Enabled" : "Disabled"),
          },
          {
            id: "delivery",
            header: "Delivery",
            text: (d) => logDeliveryWord(d),
            cell: (d) => {
              const w = logDeliveryWord(d);
              return (
                <>
                  <StatusIndicator view={VIEW[w]} />
                  {w === "Failing" && d.deliveryMessage && (
                    <div role="alert">{d.deliveryMessage}</div>
                  )}
                  {d.deliveryAt && (
                    <div>
                      {w === "Failing" ? "Failing since" : "Last delivery"}{" "}
                      <time dateTime={d.deliveryAt} title={utcTitle(d.deliveryAt)}>
                        {formatLocal(d.deliveryAt)}
                      </time>
                    </div>
                  )}
                </>
              );
            },
          },
          {
            id: "phase",
            header: "Status",
            text: (d) => d.phase,
            cell: (d) => <StatusIndicator status={{ phase: d.phase }} />,
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (d) => (
              <>
                <Button
                  aria-label={`${d.enabled ? "Disable" : "Enable"} ${d.name}`}
                  disabledReason={reason}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(d)}
                >
                  {d.enabled ? "Disable" : "Enable"}
                </Button>{" "}
                <Button
                  aria-label={`Edit ${d.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "edit", d })}
                >
                  Edit
                </Button>{" "}
                <Button
                  aria-label={`Delete ${d.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "delete", d })}
                >
                  Delete
                </Button>
              </>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(d) => d.id}
      />
      {dialog?.kind === "edit" && (
        <DestinationDialog
          teamId={teamId}
          existing={dialog.d}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.d.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.d)}
        >
          <p>Logs stop being delivered to this destination.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
