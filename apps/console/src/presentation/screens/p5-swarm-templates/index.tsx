import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { SwarmTemplateRecord } from "../../../application/ports/swarmTemplates.js";
import {
  KINDS,
  summarise,
  TEARDOWN_RULES,
  type TemplateDraft,
} from "../../../application/usecases/swarmTemplates/SwarmTemplatesUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import { format } from "../../../domain/money.js";
import { formatLocal } from "../../../domain/time.js";
import {
  ActionsMenu,
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  KeyValue,
  PageHeader,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { TemplateDialog } from "./TemplateDialog.js";

const listKey = queryKey({ area: "swarmTemplates", resource: "list" });
const labelOf = (xs: readonly { value: string; label: string }[], v: string) =>
  xs.find((x) => x.value === v)?.label ?? v;

type Dialog =
  | { kind: "edit"; t?: SwarmTemplateRecord }
  | { kind: "delete"; t: SwarmTemplateRecord }
  | { kind: "toggle"; t: SwarmTemplateRecord };

/**
 * P5 (WEB-US-41): swarm templates. Service admins create, edit, enable, disable and delete; security operators read
 * them. A disabled template is not offered when creating a work order.
 */
export default function P5() {
  const uc = useService("swarmTemplates");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:swarm-templates");
  const [selected, setSelected] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const list = useQuery({ queryKey: listKey, queryFn: ({ signal }) => uc.list(signal) });
  const items = list.data ?? [];
  const sel = items.find((t) => t.id === selected);
  const run = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => {
      setDialog(undefined);
      void qc.invalidateQueries({ queryKey: ["swarmTemplates"] });
    },
  });
  const act = (f: () => Promise<unknown>, done: string) =>
    run.mutate(async () => {
      await f();
      setNotice(done);
    });
  const err = run.error && isAppError(run.error) ? run.error : undefined;
  const listErr = list.error && isAppError(list.error) ? list.error : undefined;
  const shown = (!dialog ? err : undefined) ?? listErr;
  const needsOne = reason ?? (sel ? undefined : "Select a template first");

  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Swarm templates" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Swarm templates"
        description="The stages, pools and limits a work order's remediation team is built from."
        actions={
          <>
            {reason ? (
              <Button disabledReason={reason}>Actions ▾</Button>
            ) : (
              <ActionsMenu
                actions={[
                  {
                    id: "edit",
                    label: "Edit",
                    onSelect: () => sel && setDialog({ kind: "edit", t: sel }),
                    disabledReason: needsOne,
                  },
                  {
                    id: "toggle",
                    label: sel?.enabled ? "Disable" : "Enable",
                    onSelect: () => sel && setDialog({ kind: "toggle", t: sel }),
                    disabledReason: needsOne,
                  },
                  {
                    id: "delete",
                    label: "Delete",
                    onSelect: () => sel && setDialog({ kind: "delete", t: sel }),
                    disabledReason: needsOne,
                  },
                ]}
              />
            )}
            <Button
              variant="primary"
              disabledReason={reason}
              onClick={() => setDialog({ kind: "edit" })}
            >
              Create template
            </Button>
          </>
        }
      />
      {notice && (
        <Alert kind="success" title={notice}>
          {" "}
        </Alert>
      )}
      {shown && (
        <Alert
          kind="error"
          title={shown.isAccessDenied ? "You do not have access" : "The request failed"}
          requestId={shown.requestId}
        >
          {shown.message}
        </Alert>
      )}
      <Table<SwarmTemplateRecord>
        id="swarm-templates"
        caption="Swarm templates"
        filterLabel="Find templates"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        emptyText="No swarm templates yet."
        selection={{
          mode: "single",
          selected: selected ? [selected] : [],
          onChange: (ids) => setSelected(ids[0]),
        }}
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (t) => t.name,
            text: (t) => t.name,
            cell: (t) => <code>{t.name}</code>,
          },
          {
            id: "kind",
            header: "Kind",
            text: (t) => labelOf(KINDS, t.kind),
            cell: (t) => labelOf(KINDS, t.kind),
          },
          {
            id: "state",
            header: "State",
            text: (t) => (t.enabled ? "Enabled" : "Disabled"),
            cell: (t) => (
              <StatusIndicator
                view={{
                  word: t.enabled ? "Enabled" : "Disabled",
                  dot: t.enabled ? "green" : "grey",
                }}
              />
            ),
          },
          { id: "cap", header: "Spend cap", cell: (t) => format(t.budgetUsd) },
          { id: "ttl", header: "Time to live", cell: (t) => `${t.ttlHours} h` },
          {
            id: "teardown",
            header: "Teardown",
            cell: (t) => labelOf(TEARDOWN_RULES, t.teardownRule),
          },
          { id: "version", header: "Version", cell: (t) => t.version },
          {
            id: "updated",
            header: "Updated",
            cell: (t) =>
              t.updatedAt ? <time dateTime={t.updatedAt}>{formatLocal(t.updatedAt)}</time> : "—",
          },
        ]}
        items={items}
        getRowId={(t) => t.id}
      />
      {sel && <TemplateDetail t={sel} />}
      {dialog?.kind === "edit" && (
        <TemplateDialog
          template={dialog.t}
          busy={run.isPending}
          error={run.error}
          onCancel={() => {
            run.reset();
            setDialog(undefined);
          }}
          onSave={(d: TemplateDraft) =>
            act(
              () => (dialog.t ? uc.update(dialog.t, d) : uc.create(d)),
              dialog.t ? "Template updated" : "Template created (disabled until you enable it)",
            )
          }
        />
      )}
      {dialog?.kind === "toggle" && (
        <ConfirmDialog
          title={`${dialog.t.enabled ? "Disable" : "Enable"} ${dialog.t.name}`}
          confirmLabel={dialog.t.enabled ? "Disable" : "Enable"}
          onCancel={() => setDialog(undefined)}
          onConfirm={() =>
            act(
              () => (dialog.t.enabled ? uc.disable(dialog.t) : uc.enable(dialog.t)),
              dialog.t.enabled ? "Template disabled" : "Template enabled",
            )
          }
        >
          <p>
            {dialog.t.enabled
              ? "A disabled template is no longer offered when creating a work order. Work orders already using it keep running."
              : "The template is offered when creating a work order."}
          </p>
          <CliPreview
            command={buildCli(dialog.t.enabled ? "DisableSwarmTemplate" : "EnableSwarmTemplate", {
              templateId: dialog.t.id,
            })}
          />
        </ConfirmDialog>
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.t.name}`}
          confirmLabel="Delete"
          onCancel={() => {
            run.reset();
            setDialog(undefined);
          }}
          onConfirm={() => act(() => uc.delete(dialog.t), "Template deleted")}
        >
          {err && (
            <Alert
              kind="error"
              title={err.isAccessDenied ? "You do not have access" : "Not deleted"}
              requestId={err.requestId}
            >
              {err.message}
            </Alert>
          )}
          <p>A template cannot be deleted while an open work order uses it.</p>
          <CliPreview command={buildCli("DeleteSwarmTemplate", { templateId: dialog.t.id })} />
        </ConfirmDialog>
      )}
    </div>
  );
}

function TemplateDetail({ t }: { t: SwarmTemplateRecord }) {
  const s = summarise(t.spec);
  const list = (xs: readonly string[]) => (xs.length > 0 ? xs.join(", ") : "None");
  return (
    <Card title={`${t.name} · version ${t.version}`}>
      <KeyValue
        items={[
          { label: "Description", value: t.description ?? "—" },
          { label: "Stages", value: list(s.stages) },
          { label: "Pools", value: list(s.pools) },
          { label: "Handoffs", value: list(s.handoffs) },
          { label: "Secrets needed", value: list(s.secrets) },
          { label: "Configuration", value: list(s.configValues) },
          { label: "Last updated", value: t.updatedAt ? formatLocal(t.updatedAt) : "—" },
        ]}
      />
    </Card>
  );
}
