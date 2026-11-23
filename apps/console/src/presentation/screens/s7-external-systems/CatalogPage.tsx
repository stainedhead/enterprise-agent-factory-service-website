import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { ExternalSystemRecord } from "../../../application/ports/externalSystems.js";
import {
  needsUnmeteredConfirm,
  unmeteredWarning,
} from "../../../application/usecases/externalSystems/AdminExternalSystemsUseCases.js";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { CatalogDialog } from "./CatalogDialog.js";
import { TeamsMayDeclare } from "./TeamsMayDeclare.js";

const catalogKey = queryKey({ area: "admin-externalSystems", resource: "catalog" });

/**
 * S7 (WEB-US-18): the service catalog. Built-in systems cannot be deleted; the service-level switch turns
 * a system off for every team; enabling an unmetered system needs a confirmation.
 */
export function CatalogPage() {
  const catalog = useService("adminExternalSystems");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:external-systems");
  const [dialog, setDialog] = useState<
    | { kind: "edit"; s?: ExternalSystemRecord }
    | { kind: "delete"; s: ExternalSystemRecord }
    | { kind: "enable"; s: ExternalSystemRecord }
    | undefined
  >();
  const list = useQuery({ queryKey: catalogKey, queryFn: ({ signal }) => catalog.list(signal) });
  const refresh = () => qc.invalidateQueries({ queryKey: catalogKey });
  const toggle = useMutation({
    mutationFn: (v: { s: ExternalSystemRecord; on: boolean }) => catalog.setEnabled(v.s, v.on),
    onSuccess: () => setDialog(undefined),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (s: ExternalSystemRecord) => catalog.delete(s),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const flip = (s: ExternalSystemRecord, on: boolean) => {
    if (needsUnmeteredConfirm(s, on)) setDialog({ kind: "enable", s });
    else toggle.mutate({ s, on });
  };

  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "External systems" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="External systems"
        description="The catalog of services agents may reach. A system switched off here is off for every team."
        infoHref="/docs/external-systems"
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => setDialog({ kind: "edit" })}
          >
            Add system
          </Button>
        }
      />
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Card>
        <Table
          id="catalog-external-systems"
          caption="Catalog"
          filterLabel="Find systems"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="The catalog is empty."
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (s) => s.name,
              text: (s) => s.name,
              cell: (s) => (
                <>
                  {s.name} {s.unmetered && <Badge tone="teal">Unmetered</Badge>}{" "}
                  {s.builtin && <Badge>Built-in</Badge>}
                </>
              ),
            },
            {
              id: "category",
              header: "Category",
              sortValue: (s) => s.category,
              cell: (s) => s.category,
            },
            { id: "endpoints", header: "Endpoints", cell: (s) => s.endpoints.join(", ") },
            {
              id: "service",
              header: "Service switch",
              text: (s) => (s.enabled ? "On" : "Off"),
              cell: (s) => (
                <span title={reason}>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={s.name}
                    aria-checked={s.enabled}
                    checked={s.enabled}
                    aria-disabled={reason !== undefined || toggle.isPending}
                    onChange={(e) => {
                      if (!reason && !toggle.isPending) flip(s, e.target.checked);
                    }}
                  />{" "}
                  {s.enabled ? "On" : "Off for all teams"}
                </span>
              ),
            },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (s) => (
                <>
                  <Button
                    aria-label={`Edit ${s.name}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "edit", s })}
                  >
                    Edit
                  </Button>
                  {!s.builtin && (
                    <>
                      {" "}
                      <Button
                        aria-label={`Delete ${s.name}`}
                        disabledReason={reason}
                        onClick={() => setDialog({ kind: "delete", s })}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </>
              ),
            },
          ]}
          items={list.data ?? []}
          getRowId={(s) => s.id}
        />
      </Card>
      <TeamsMayDeclare />
      {dialog?.kind === "edit" && (
        <CatalogDialog
          existing={dialog.s}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.s.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.s)}
        >
          Teams lose access to {dialog.s.name}.
        </ConfirmDialog>
      )}
      {dialog?.kind === "enable" && (
        <ConfirmDialog
          title={`Enable ${dialog.s.name}`}
          confirmLabel="Enable"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => toggle.mutate({ s: dialog.s, on: true })}
        >
          {unmeteredWarning(dialog.s.name)}
        </ConfirmDialog>
      )}
    </div>
  );
}
