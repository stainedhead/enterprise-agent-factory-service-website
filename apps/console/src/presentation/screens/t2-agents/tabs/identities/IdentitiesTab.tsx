import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { AgentIdentityRecord } from "../../../../../application/ports/identity.js";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  Modal,
  SelectInput,
  StatusIndicator,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../../query/keys.js";
import { useOptionalService, useService } from "../../../../services.js";
import type { PanelTabProps } from "../../panelTabs.js";

const KINDS = [
  { value: "github_app", label: "GitHub App" },
  { value: "external", label: "External identity" },
] as const;
const kindLabel = (k: string) =>
  KINDS.find((x) => x.value === k)?.label ??
  (k === "k8s_service_account"
    ? "Kubernetes service account"
    : k === "aws_iam_role"
      ? "AWS IAM role"
      : k);
const STATUS = {
  active: { word: "Active", dot: "green" },
  pending: { word: "Pending", dot: "blue" },
  disabled: { word: "Disabled", dot: "grey" },
  error: { word: "Failed", dot: "red" },
} as const;

function AddIdentityDialog({
  teamId,
  agentId,
  onClose,
  onSaved,
}: {
  teamId: string;
  agentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const identity = useService("identity");
  const secrets = useOptionalService("secrets");
  const list = useQuery({
    queryKey: queryKey({ area: "secrets", teamId, resource: "list" }),
    queryFn: ({ signal }) => (secrets ? secrets.list(teamId, signal) : Promise.resolve([])),
    retry: false,
  });
  const [kind, setKind] = useState<"github_app" | "external">("external");
  const [externalRef, setExternalRef] = useState("");
  const [secretId, setSecretId] = useState("");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;
  const submit = async () => {
    setPending(true);
    try {
      await identity.addIdentity(teamId, agentId, {
        kind,
        externalRef,
        ...(secretId && { secretId }),
      });
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title="Add identity"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            Add identity
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The identity was not added"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField label="Kind">
        <SelectInput
          value={kind}
          options={KINDS.map((k) => ({ ...k }))}
          onChange={(e) => setKind(e.target.value === "github_app" ? "github_app" : "external")}
        />
      </FormField>
      <FormField
        label="Identifier"
        hint="For example the GitHub App id or the external account name"
        error={err?.fields.externalRef}
      >
        <TextInput value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
      </FormField>
      <FormField
        label="Credential secret"
        hint="The secret that holds its credential. Optional; its value is never shown."
      >
        <SelectInput
          value={secretId}
          options={[
            { value: "", label: "None" },
            ...(list.data ?? []).map((s) => ({ value: s.id, label: s.name })),
          ]}
          onChange={(e) => setSecretId(e.target.value)}
        />
      </FormField>
    </Modal>
  );
}

/** *Identities* (WEB-US-25.4): the agent's external identities (AGT-5) with add and remove. */
export function IdentitiesTab({ teamId, agent }: PanelTabProps) {
  const identity = useService("identity");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("identities:write");
  const key = queryKey({ area: "identity", teamId, resource: "identities", id: agent.id });
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => identity.identities(teamId, agent.id, signal),
  });
  const [dialog, setDialog] = useState<
    { kind: "add" } | { kind: "remove"; i: AgentIdentityRecord } | undefined
  >();
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const remove = useMutation({
    mutationFn: (i: AgentIdentityRecord) => identity.removeIdentity(teamId, agent.id, i),
    onSettled: () => {
      setDialog(undefined);
      refresh();
    },
  });
  const err = isAppError(remove.error) ? remove.error : undefined;
  return (
    <Card
      title="External identities"
      actions={
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "add" })}
        >
          Add identity
        </Button>
      }
    >
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The identity was not removed"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Table
        id={`agent-identities-${agent.id}`}
        caption={`Identities of ${agent.name}`}
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No identities yet."
        columns={[
          {
            id: "kind",
            header: "Kind",
            alwaysVisible: true,
            text: (i) => kindLabel(i.kind),
            cell: (i) => kindLabel(i.kind),
          },
          {
            id: "ref",
            header: "Identifier",
            text: (i) => i.externalRef,
            cell: (i) => <code>{i.externalRef}</code>,
          },
          {
            id: "secret",
            header: "Credential secret",
            cell: (i) => (i.secretId ? <code>{i.secretId}</code> : "—"),
          },
          {
            id: "status",
            header: "Status",
            text: (i) => (STATUS[i.status as keyof typeof STATUS] ?? { word: i.status }).word,
            cell: (i) => (
              <StatusIndicator
                view={STATUS[i.status as keyof typeof STATUS] ?? { word: i.status, dot: "grey" }}
              />
            ),
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (i) =>
              i.kind === "github_app" || i.kind === "external" ? (
                <Button
                  aria-label={`Remove ${i.externalRef}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "remove", i })}
                >
                  Remove
                </Button>
              ) : null,
          },
        ]}
        items={list.data ?? []}
        getRowId={(i) => i.id}
      />
      {dialog?.kind === "add" && (
        <AddIdentityDialog
          teamId={teamId}
          agentId={agent.id}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            refresh();
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title={`Remove ${dialog.i.externalRef}`}
          confirmLabel="Remove"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => remove.mutate(dialog.i)}
        >
          <p>The agent can no longer use this identity.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
