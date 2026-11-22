import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { ChannelRecord } from "../../../../../application/ports/notifications.js";
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
import { gate } from "../../../../hooks/gate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";
import { ServiceChannelDialog } from "./ServiceChannelDialog.js";

const VIEW = {
  Failing: { word: "Failing", dot: "red" },
  Delivering: { word: "Delivering", dot: "green" },
  "Not yet used": { word: "Not yet used", dot: "grey" },
} as const;

const key = queryKey({ area: "admin-notification-channels", resource: "list" });

/**
 * S10 *Notification channels* (WEB-US-20.7): the service's own email, Slack, webhook and Jira channels. Deleting
 * a channel that work orders name shows the API's `409`; disable it instead.
 */
export function NotificationChannelsTab() {
  const svc = useService("adminNotificationChannels");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:settings");
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => svc.list(signal) });
  const [dialog, setDialog] = useState<
    { kind: "edit"; c?: ChannelRecord } | { kind: "delete"; c: ChannelRecord } | undefined
  >();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (c: ChannelRecord) => svc.setEnabled(c, !c.enabled),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (c: ChannelRecord) => svc.delete(c),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);

  return (
    <Card
      title="Notification channels"
      actions={
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "edit" })}
        >
          Add channel
        </Button>
      }
    >
      <p>
        Service channels receive service-level events such as work order alerts. Credentials are
        held as secrets, never here.
      </p>
      {err && (
        <Alert
          kind="error"
          title={
            err.isAccessDenied
              ? "You do not have access"
              : err.kind === "conflict"
                ? "The channel is in use"
                : "The change was not applied"
          }
          requestId={err.requestId}
        >
          {err.message}
          {err.kind === "conflict" && " Disable the channel instead of deleting it."}
        </Alert>
      )}
      <Table
        id="admin-notification-channels"
        caption="Service notification channels"
        filterLabel="Find channels"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No service channels yet."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (c: ChannelRecord) => c.name,
            text: (c) => c.name,
            cell: (c) => c.name,
          },
          { id: "kind", header: "Kind", text: (c) => c.kind, cell: (c) => c.kind },
          {
            id: "events",
            header: "Events",
            text: (c) => c.eventTypes.join(" "),
            cell: (c) => c.eventTypes.join(", "),
          },
          {
            id: "state",
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
                    <div role="alert">{c.delivery.lastError}</div>
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
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (c) => (
              <>
                <Button
                  aria-label={`${c.enabled ? "Disable" : "Enable"} ${c.name}`}
                  disabledReason={reason}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(c)}
                >
                  {c.enabled ? "Disable" : "Enable"}
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
                  onClick={() => setDialog({ kind: "delete", c })}
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
        <ServiceChannelDialog
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
          <p>The channel stops receiving events.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
