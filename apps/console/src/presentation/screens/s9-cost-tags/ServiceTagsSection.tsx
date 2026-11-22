import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { ServiceTagItem } from "../../../application/ports/adminServiceTags.js";
import { SYSTEM_TAGS } from "../../../application/usecases/adminServiceTags/AdminServiceTagsUseCases.js";
import { Alert, Button, Card, ConfirmDialog, Table } from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { ServiceTagDialog } from "./ServiceTagDialog.js";

const listKey = queryKey({ area: "admin-serviceTags", resource: "list" });
const missingKey = queryKey({ area: "admin-serviceTags", resource: "missing" });

/** System tags (read-only), service tags (add, edit, remove) and the teams missing a required value (WEB-US-19.1). */
export function ServiceTagsSection() {
  const tags = useService("adminServiceTags");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:service-tags");
  const list = useQuery({ queryKey: listKey, queryFn: ({ signal }) => tags.list(signal) });
  const missing = useQuery({
    queryKey: [...missingKey, (list.data ?? []).map((t) => t.key).join(",")],
    queryFn: ({ signal }) => tags.missing(list.data ?? [], signal),
    enabled: list.data !== undefined,
    retry: false,
  });
  const [dialog, setDialog] = useState<
    { kind: "edit"; t?: ServiceTagItem } | { kind: "remove"; t: ServiceTagItem } | undefined
  >();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: listKey });
    void qc.invalidateQueries({ queryKey: missingKey });
  };
  const remove = useMutation({
    mutationFn: (t: ServiceTagItem) => tags.remove(t),
    onSettled: () => {
      setDialog(undefined);
      refresh();
    },
  });
  const err = [list.error, remove.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);

  return (
    <>
      <Card title="System tags">
        <p>AFS sets these on every resource it creates. They cannot be changed or removed.</p>
        <Table
          id="system-tags"
          caption="System tags"
          filterLabel="Find system tags"
          status="ready"
          emptyText="None."
          columns={[
            {
              id: "key",
              header: "Key",
              alwaysVisible: true,
              text: (t) => t.key,
              cell: (t) => <code>{t.key}</code>,
            },
            {
              id: "applied",
              header: "Applied to",
              text: (t) => t.appliedTo,
              cell: (t) => t.appliedTo,
            },
          ]}
          items={SYSTEM_TAGS}
          getRowId={(t) => t.key}
        />
      </Card>
      <Card
        title="Service tags"
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => setDialog({ kind: "edit" })}
          >
            Add service tag
          </Button>
        }
      >
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
          id="service-tags"
          caption="Service tags"
          filterLabel="Find service tags"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="No service tags yet."
          columns={[
            {
              id: "key",
              header: "Key",
              alwaysVisible: true,
              sortValue: (t) => t.key,
              text: (t) => t.key,
              cell: (t) => <code>{t.key}</code>,
            },
            {
              id: "kind",
              header: "Kind",
              text: (t) => (t.mode === "fixed" ? "Fixed" : "Required"),
              cell: (t) => (t.mode === "fixed" ? "Fixed" : "Required"),
            },
            {
              id: "value",
              header: "Value or allowed values",
              text: (t) =>
                t.mode === "fixed" ? (t.value ?? "") : (t.allowedValues ?? []).join(" "),
              cell: (t) =>
                t.mode === "fixed"
                  ? (t.value ?? "—")
                  : t.allowedValues?.length
                    ? t.allowedValues.join(", ")
                    : "Any value",
            },
            { id: "default", header: "Default", cell: (t) => t.defaultValue ?? "—" },
            { id: "description", header: "Description", cell: (t) => t.description ?? "—" },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (t) => (
                <>
                  <Button
                    aria-label={`Edit ${t.key}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "edit", t })}
                  >
                    Edit
                  </Button>{" "}
                  <Button
                    aria-label={`Remove ${t.key}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "remove", t })}
                  >
                    Remove
                  </Button>
                </>
              ),
            },
          ]}
          items={list.data ?? []}
          getRowId={(t) => t.key}
        />
      </Card>
      <Card title="Teams missing a required value">
        {missing.isPending && list.data !== undefined && <p role="status">Checking teams…</p>}
        {missing.isError && <p role="alert">The teams could not be checked.</p>}
        {missing.data && missing.data.length === 0 && (
          <p>Every team has a value for each required tag.</p>
        )}
        {missing.data && missing.data.length > 0 && (
          <ul aria-label="Teams missing a required value">
            {missing.data.map((m) => (
              <li key={m.teamId}>
                <Link to={`/t/${m.teamId}/tags`}>{m.displayName}</Link>: {m.keys.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dialog?.kind === "edit" && (
        <ServiceTagDialog
          existing={dialog.t}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            refresh();
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title={`Remove ${dialog.t.key}`}
          confirmLabel="Remove"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => remove.mutate(dialog.t)}
        >
          <p>Teams stop receiving this tag on new resources and in spend grouping.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
