import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type {
  ChannelRecord,
  ScheduleRef,
  TestResult,
} from "../../../../../application/ports/notifications.js";
import { deliveryWord } from "../../../../../application/usecases/notifications/NotificationsUseCases.js";
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
import { ChannelDialog, KINDS } from "./ChannelDialog.js";

const VIEW = {
  Failing: { word: "Failing", dot: "red" },
  Delivering: { word: "Delivering", dot: "green" },
  "Not yet used": { word: "Not yet used", dot: "grey" },
} as const;

const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;

/**
 * *Notifications* (WEB-US-34.2 to 34.5): the team's channels with their events and delivery status. A failed
 * delivery shows its error on the channel; *Send test* waits for a pending test; deleting a channel that report
 * schedules deliver to lists them first.
 */
export function NotificationsTab({ teamId }: { teamId: string }) {
  const notifications = useService("notifications");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("notifications:write");
  const key = queryKey({ area: "notifications", teamId, resource: "channels" });
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => notifications.list(teamId, signal),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [dialog, setDialog] = useState<
    | { kind: "edit"; c?: ChannelRecord }
    | { kind: "delete"; c: ChannelRecord; using: readonly ScheduleRef[] }
    | undefined
  >();
  const [tests, setTests] = useState<Record<string, TestResult | "running">>({});

  const test = useMutation({
    mutationFn: async (c: ChannelRecord) => {
      setTests((t) => ({ ...t, [c.id]: "running" }));
      try {
        const r = await notifications.sendTest(teamId, c.id);
        setTests((t) => ({ ...t, [c.id]: r }));
      } catch (e) {
        setTests((t) => {
          const { [c.id]: _gone, ...rest } = t;
          return rest;
        });
        throw e;
      }
    },
    onSettled: () => void refresh(),
  });
  const askDelete = useMutation({
    mutationFn: async (c: ChannelRecord) => ({
      c,
      using: await notifications.schedulesUsing(teamId, c.id),
    }),
    onSuccess: ({ c, using }) => setDialog({ kind: "delete", c, using }),
  });
  const del = useMutation({
    mutationFn: (c: ChannelRecord) => notifications.delete(teamId, c),
    onSettled: () => {
      setDialog(undefined);
      void refresh();
    },
  });
  const err = [test.error, askDelete.error, del.error]
    .map((e) => (isAppError(e) ? e : undefined))
    .find(Boolean);

  return (
    <Card title="Notification channels">
      <p>
        Channels receive team events such as budget thresholds. Credentials are held as secrets,
        never here.
      </p>
      <div style={{ marginBottom: 12 }}>
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "edit" })}
        >
          Add channel
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
        id={`notification-channels-${teamId}`}
        caption="Notification channels"
        filterLabel="Find channels"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No channels yet."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (c) => c.name,
            text: (c) => c.name,
            cell: (c) => c.name,
          },
          {
            id: "kind",
            header: "Kind",
            sortValue: (c) => c.kind,
            text: (c) => kindLabel(c.kind),
            cell: (c) => kindLabel(c.kind),
          },
          {
            id: "events",
            header: "Events",
            text: (c) => c.eventTypes.join(" "),
            cell: (c) => c.eventTypes.join(", "),
          },
          {
            id: "enabled",
            header: "State",
            text: (c) => (c.enabled ? "Enabled" : "Disabled"),
            cell: (c) => (c.enabled ? "Enabled" : "Disabled"),
          },
          {
            id: "delivery",
            header: "Delivery",
            text: (c) => deliveryWord(c),
            cell: (c) => {
              const w = deliveryWord(c);
              const at = c.delivery.lastDeliveredAt;
              return (
                <>
                  <StatusIndicator view={VIEW[w]} />
                  {w === "Failing" && c.delivery.lastError && (
                    <div role="alert">
                      {c.delivery.lastError}
                      {c.delivery.lastFailureAt && (
                        <>
                          {" "}
                          <time
                            dateTime={c.delivery.lastFailureAt}
                            title={utcTitle(c.delivery.lastFailureAt)}
                          >
                            {formatLocal(c.delivery.lastFailureAt)}
                          </time>
                        </>
                      )}
                    </div>
                  )}
                  {w !== "Failing" && at && (
                    <div>
                      Last delivered{" "}
                      <time dateTime={at} title={utcTitle(at)}>
                        {formatLocal(at)}
                      </time>
                    </div>
                  )}
                </>
              );
            },
          },
          {
            id: "test",
            header: "Test",
            cell: (c) => {
              const t = tests[c.id];
              if (t === "running") return <span role="status">Sending test…</span>;
              if (!t) return null;
              if (t.pending)
                return <span role="status">Still pending; check the delivery status.</span>;
              return t.delivered ? (
                <span role="status">Test delivered</span>
              ) : (
                <span role="alert">Test failed: {t.error ?? "not delivered"}</span>
              );
            },
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (c) => (
              <>
                <Button
                  aria-label={`Send test to ${c.name}`}
                  disabledReason={reason}
                  disabled={tests[c.id] === "running"}
                  onClick={() => test.mutate(c)}
                >
                  Send test
                </Button>{" "}
                <Button
                  aria-label={`Edit ${c.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "edit", c })}
                >
                  Edit
                </Button>{" "}
                <Button
                  aria-label={`Delete ${c.name}`}
                  disabledReason={reason}
                  disabled={askDelete.isPending}
                  onClick={() => askDelete.mutate(c)}
                >
                  Delete
                </Button>
              </>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(c) => c.id}
      />
      {dialog?.kind === "edit" && (
        <ChannelDialog
          teamId={teamId}
          existing={dialog.c}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.c.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.c)}
        >
          {dialog.using.length > 0 ? (
            <>
              <p>These report schedules deliver to this channel and will stop delivering:</p>
              <ul>
                {dialog.using.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>The channel stops receiving events.</p>
          )}
        </ConfirmDialog>
      )}
    </Card>
  );
}
