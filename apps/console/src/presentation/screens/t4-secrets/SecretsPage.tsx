import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { SecretRecord } from "../../../application/ports/secrets.js";
import { MASTER_KEY, MASTER_KEY_TEXT, managedRefusalText } from "../../../domain/collaboration.js";
import { managedByLabel } from "../../../domain/orchestration.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  SelectInput,
  Table,
} from "../../components/index.js";
import { teamKey, useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { agentsKey } from "../t2-agents/keys.js";
import { CreateSecretDialog, RotateSecretDialog } from "./SecretDialogs.js";

const secretsKey = (teamId: string) => queryKey({ area: "secrets", teamId, resource: "secrets" });
const managedTip = (s: SecretRecord) =>
  s.managedBy === "afs" || s.managedBy === "paperclip" ? managedByLabel(s.managedBy) : undefined;
/** Why *Rotate* is unavailable for a row, if it is (WEB-US-54). */
const rotateTip = (s: SecretRecord, writeReason: string | undefined) =>
  writeReason ??
  (s.name === MASTER_KEY
    ? MASTER_KEY_TEXT
    : s.managedBy === "paperclip"
      ? "Managed by Paperclip"
      : undefined);

const rotationText = (s: SecretRecord) =>
  s.rotation?.enabled && s.rotation.days ? `Every ${s.rotation.days} days` : "—";

/**
 * T4 (WEB-US-27) and, with `viewer`, V2 (WEB-US-36.2): secret names, paths, usage and rotation. A secret's
 * value is never shown; the value column reads "Write-only".
 */
export function SecretsPage({ viewer = false }: { viewer?: boolean }) {
  const { teamId = "" } = useParams();
  const secrets = useService("secrets");
  const agentsSvc = useService("agents");
  const teams = useService("teams");
  const systemsSvc = useService("externalSystems");
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const managedFilter = params.get("managedBy") ?? "";
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("secrets:write");
  const [dialog, setDialog] = useState<
    | { kind: "create" }
    | { kind: "rotate"; s: SecretRecord }
    | { kind: "delete"; s: SecretRecord }
    | undefined
  >();

  const list = useQuery({
    queryKey: secretsKey(teamId),
    queryFn: ({ signal }) => secrets.list(teamId, signal),
  });
  const agents = useQuery({
    queryKey: agentsKey(teamId),
    queryFn: ({ signal }) => agentsSvc.list(teamId, signal),
  });
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const systems = useQuery({
    queryKey: queryKey({ area: "externalSystems", teamId, resource: "team" }),
    queryFn: ({ signal }) => systemsSvc.listTeam(teamId, signal),
    enabled: !viewer,
  });
  const items = (list.data ?? []).filter(
    (s) => !managedFilter || (s.managedBy ?? "user") === managedFilter,
  );
  const agentRefs = (agents.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  const nameOf = (id: string) => agentRefs.find((a) => a.id === id)?.name ?? id;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: secretsKey(teamId) });
    void qc.invalidateQueries({ queryKey: agentsKey(teamId) });
  };

  const del = useMutation({
    mutationFn: (s: SecretRecord) => secrets.delete(teamId, { id: s.id, version: s.version }),
    onSuccess: () => {
      setDialog(undefined);
      refresh();
    },
    onError: () => setDialog(undefined),
  });
  const delErr = isAppError(del.error) ? del.error : undefined;
  const failed = del.variables;
  const dependents: string[] =
    delErr?.kind === "conflict"
      ? Array.isArray(delErr.details.agents)
        ? (delErr.details.agents as string[])
        : [...(failed?.boundTo ?? [])]
      : [];

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Secrets" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title={`Secrets (${list.data?.length ?? 0})`}
        description="Stored in AWS Secrets Manager. Values are write-only: Agent Factory keeps the reference and never shows a value again."
        infoHref="/docs/secrets"
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => setDialog({ kind: "create" })}
          >
            Create secret
          </Button>
        }
      />
      {delErr && !delErr.isAccessDenied && (
        <Alert
          kind="error"
          title={
            delErr.kind === "conflict" && dependents.length > 0
              ? `${failed?.name ?? "The secret"} is bound to agents`
              : "The secret was not deleted"
          }
          requestId={delErr.requestId}
        >
          {delErr.kind === "conflict" && dependents.length > 0 ? (
            <>
              Remove the binding from these agents first:{" "}
              {dependents.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <Link to={`/t/${teamId}/agents/${id}`}>{nameOf(id)}</Link>
                </span>
              ))}
              .
            </>
          ) : (
            (managedRefusalText(delErr.reason, failed?.managedBy) ?? delErr.message)
          )}
        </Alert>
      )}
      <Card>
        <div>
          Managed by{" "}
          <SelectInput
            aria-label="Managed by"
            value={managedFilter}
            placeholder="All"
            options={[
              { value: "user", label: "Team" },
              { value: "afs", label: "Managed by AFS" },
              { value: "paperclip", label: "Managed by Paperclip" },
            ]}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set("managedBy", e.target.value);
              else next.delete("managedBy");
              setParams(next, { replace: true });
            }}
          />
        </div>
        <Table
          id={viewer ? "team-secrets-viewer" : "team-secrets"}
          caption="Secrets"
          filterLabel="Find secrets"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="This team has no secrets yet."
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (s) => s.name,
              cell: (s) => s.name,
            },
            {
              id: "managedBy",
              header: "Managed by",
              sortValue: (s) => s.managedBy ?? "user",
              text: (s) => managedByLabel(s.managedBy),
              cell: (s) =>
                managedTip(s) ? (
                  <Badge tone={s.managedBy === "afs" ? "blue" : "amber"}>{managedTip(s)}</Badge>
                ) : (
                  "Team"
                ),
            },
            {
              id: "scope",
              header: "Scope",
              sortValue: (s) => s.scope,
              text: (s) => (s.scope === "team" ? "Team shared" : "Agent"),
              cell: (s) =>
                s.scope === "team"
                  ? "Team shared"
                  : `Agent: ${s.agentId ? nameOf(s.agentId) : "—"}`,
            },
            {
              id: "path",
              header: "Managed path",
              cell: (s) => <code>{s.secretsManagerPath}</code>,
              text: (s) => s.secretsManagerPath,
            },
            {
              id: "usage",
              header: "Used by",
              sortValue: (s) => s.boundTo.length,
              text: (s) => s.boundTo.map(nameOf).join(" "),
              cell: (s) =>
                s.managedBy === "paperclip"
                  ? "Not bindable"
                  : s.boundTo.length === 0
                    ? "—"
                    : s.boundTo.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ", "}
                          <Link to={`/t/${teamId}/agents/${id}`}>{nameOf(id)}</Link>
                        </span>
                      )),
            },
            { id: "rotation", header: "Rotation", cell: rotationText },
            {
              id: "changed",
              header: "Last changed",
              sortValue: (s) => s.lastChangedAt ?? "",
              cell: (s) =>
                s.lastChangedAt ? (
                  <time dateTime={s.lastChangedAt}>{formatLocal(s.lastChangedAt)}</time>
                ) : (
                  "—"
                ),
            },
            ...(viewer ? [] : [{ id: "value", header: "Value", cell: () => "Write-only" }]),
            ...(viewer
              ? []
              : [
                  {
                    id: "actions",
                    header: "Actions",
                    alwaysVisible: true,
                    cell: (s: SecretRecord) => (
                      <>
                        <Button
                          aria-label={`Rotate ${s.name}`}
                          disabledReason={rotateTip(s, reason)}
                          onClick={() => setDialog({ kind: "rotate", s })}
                        >
                          Rotate
                        </Button>{" "}
                        <Button
                          aria-label={`Delete ${s.name}`}
                          disabledReason={reason ?? managedTip(s)}
                          onClick={() => setDialog({ kind: "delete", s })}
                        >
                          Delete
                        </Button>
                      </>
                    ),
                  },
                ]),
          ]}
          items={items}
          getRowId={(s) => s.id}
        />
      </Card>
      {dialog?.kind === "create" && (
        <CreateSecretDialog
          teamId={teamId}
          namespace={team.data?.namespace ?? "<namespace>"}
          agents={agentRefs}
          systems={(systems.data ?? []).map((s) => ({ id: s.id, name: s.name }))}
          onClose={() => setDialog(undefined)}
          onCreated={() => {
            setDialog(undefined);
            refresh();
          }}
        />
      )}
      {dialog?.kind === "rotate" && (
        <RotateSecretDialog
          teamId={teamId}
          secret={dialog.s}
          restarting={dialog.s.boundTo.map(nameOf)}
          onClose={() => setDialog(undefined)}
          onRotated={() => {
            setDialog(undefined);
            refresh();
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
          The secret is removed from AWS Secrets Manager. A secret bound to an agent cannot be
          deleted.
        </ConfirmDialog>
      )}
    </div>
  );
}
