import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { ConfigValueRecord } from "../../../application/ports/configValues.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  Modal,
  PageHeader,
  SelectInput,
  Table,
  TextInput,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { agentsKey } from "../t2-agents/keys.js";

const nsKey = (teamId: string) => queryKey({ area: "config", teamId, resource: "namespace" });
const agentKey = (teamId: string, agentId: string) =>
  queryKey({ area: "config", teamId, resource: "agent", id: agentId });

/**
 * T7 (WEB-US-30): the team's configuration values, non-secret only. Namespace values are shared by agents;
 * an agent's table shows whether each value is its own or the namespace's, and what the agent receives.
 */
export function ConfigPage() {
  const { teamId = "" } = useParams();
  const config = useService("configValues");
  const agentsSvc = useService("agents");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("config:write");
  const [dialog, setDialog] = useState<
    { kind: "edit"; v?: ConfigValueRecord } | { kind: "delete"; v: ConfigValueRecord } | undefined
  >();
  const [agentId, setAgentId] = useState("");

  const ns = useQuery({
    queryKey: nsKey(teamId),
    queryFn: ({ signal }) => config.listNamespace(teamId, signal),
  });
  const agents = useQuery({
    queryKey: agentsKey(teamId),
    queryFn: ({ signal }) => agentsSvc.list(teamId, signal),
  });
  const agentList = agents.data ?? [];
  const chosen = agentId || agentList[0]?.id || "";
  const agentVals = useQuery({
    queryKey: agentKey(teamId, chosen),
    queryFn: ({ signal }) => config.listAgent(teamId, chosen, signal),
    enabled: chosen !== "",
  });
  const nameOf = (id: string) => agentList.find((a) => a.id === id)?.name ?? id;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: nsKey(teamId) });
    void qc.invalidateQueries({
      queryKey: queryKey({ area: "config", teamId, resource: "agent" }),
    });
  };

  const del = useMutation({
    mutationFn: (v: ConfigValueRecord) => config.deleteNamespace(teamId, v),
    onSuccess: () => {
      setDialog(undefined);
      refresh();
    },
    onError: () => setDialog(undefined),
  });
  const delErr = isAppError(del.error) ? del.error : undefined;
  const failed = del.variables;
  const inUse = delErr?.kind === "conflict" ? [...(failed?.usedBy ?? [])] : [];

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Configuration values" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Configuration values"
        description="Non-secret settings for the team's agents. Credentials belong under Secrets."
        infoHref="/docs/config"
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => setDialog({ kind: "edit" })}
          >
            Add value
          </Button>
        }
      />
      {delErr && !delErr.isAccessDenied && (
        <Alert
          kind="error"
          title={
            inUse.length > 0
              ? `${failed?.name ?? "The value"} is used by agents`
              : "The value was not deleted"
          }
          requestId={delErr.requestId}
        >
          {inUse.length > 0 ? (
            <>
              Switch these agents to their own value first:{" "}
              {inUse.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <Link to={`/t/${teamId}/agents/${id}`}>{nameOf(id)}</Link>
                </span>
              ))}
              .
            </>
          ) : (
            delErr.message
          )}
        </Alert>
      )}
      <Card>
        <Table
          id="config-namespace"
          caption="Namespace values"
          filterLabel="Find namespace values"
          status={ns.isPending ? "loading" : ns.isError ? "error" : "ready"}
          error={isAppError(ns.error) ? ns.error.message : undefined}
          emptyText="This team has no namespace values yet."
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (v) => v.name,
              cell: (v) => <code>{v.name}</code>,
              text: (v) => v.name,
            },
            { id: "value", header: "Value", sortValue: (v) => v.value ?? "", cell: (v) => v.value },
            {
              id: "using",
              header: "Agents using",
              sortValue: (v) => v.usedBy.length,
              text: (v) => v.usedBy.map(nameOf).join(" "),
              cell: (v) =>
                v.usedBy.length === 0
                  ? "—"
                  : v.usedBy.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ", "}
                        <Link to={`/t/${teamId}/agents/${id}`}>{nameOf(id)}</Link>
                      </span>
                    )),
            },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (v) => (
                <>
                  <Button
                    aria-label={`Edit ${v.name}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "edit", v })}
                  >
                    Edit
                  </Button>{" "}
                  <Button
                    aria-label={`Delete ${v.name}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "delete", v })}
                  >
                    Delete
                  </Button>
                </>
              ),
            },
          ]}
          items={ns.data ?? []}
          getRowId={(v) => v.name}
        />
      </Card>
      <Card>
        <FormField label="Agent">
          <SelectInput
            value={chosen}
            options={agentList.map((a) => ({ value: a.id, label: a.name }))}
            onChange={(e) => setAgentId(e.target.value)}
          />
        </FormField>
        <Table
          id="config-agent"
          caption="Agent values"
          filterLabel="Find agent values"
          status={agentVals.isPending && chosen ? "loading" : agentVals.isError ? "error" : "ready"}
          error={isAppError(agentVals.error) ? agentVals.error.message : undefined}
          emptyText="This agent has no configuration values."
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (v) => v.name,
              cell: (v) => <code>{v.name}</code>,
              text: (v) => v.name,
            },
            {
              id: "source",
              header: "Source",
              sortValue: (v) => v.source,
              cell: (v) => (v.source === "namespace" ? "Namespace" : "Agent value"),
            },
            {
              id: "effective",
              header: "Effective value",
              sortValue: (v) => v.resolvedValue ?? "",
              cell: (v) => v.resolvedValue ?? "—",
            },
          ]}
          items={chosen ? (agentVals.data ?? []) : []}
          getRowId={(v) => v.name}
        />
      </Card>
      {dialog?.kind === "edit" && (
        <ValueDialog
          teamId={teamId}
          existing={dialog.v}
          restarting={(dialog.v?.usedBy ?? []).map(nameOf)}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.v.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.v)}
        >
          A value that agents use cannot be deleted.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Add or edit a namespace value; an edit warns which agents restart (WEB-US-30.3). */
function ValueDialog({
  teamId,
  existing,
  restarting,
  onClose,
  onSaved,
}: {
  teamId: string;
  existing: ConfigValueRecord | undefined;
  restarting: readonly string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const config = useService("configValues");
  const [name, setName] = useState(existing?.name ?? "");
  const [value, setValue] = useState(existing?.value ?? "");
  const save = useMutation({
    mutationFn: () => config.putNamespace(teamId, name, value, existing),
    onSuccess: onSaved,
  });
  const err = isAppError(save.error) ? save.error : undefined;
  const nameError = err?.fields.name;
  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add configuration value"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The value was not saved" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {restarting.length > 0 && (
        <Alert kind="warning" title="Agents restart">
          Saving restarts the agents that use this value: {restarting.join(", ")}.
        </Alert>
      )}
      <FormField label="Name" hint="UPPER_SNAKE_CASE" error={nameError}>
        <TextInput
          value={name}
          readOnly={existing !== undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      {nameError && /credential/i.test(nameError) && (
        <p>
          <Link to={`/t/${teamId}/secrets`}>Go to Secrets</Link>
        </p>
      )}
      <FormField label="Value" error={err?.fields.value}>
        <TextInput value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
    </Modal>
  );
}
