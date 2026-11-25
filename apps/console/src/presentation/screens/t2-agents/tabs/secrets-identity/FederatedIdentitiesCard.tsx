import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { FederatedIdentityRecord } from "../../../../../application/ports/mcp.js";
import {
  type FederatedIdentityDraft,
  federatedEnvVar,
  federatedFilePath,
  putFederatedIdentityCli,
} from "../../../../../domain/mcp.js";
import { can } from "../../../../../domain/me.js";
import {
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  Modal,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../../query/keys.js";
import { useOptionalService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";
import { ErrorAlert } from "../../../sm-mcp/shared.js";
import type { PanelTabProps } from "../../panelTabs.js";

const key = (teamId: string, agentId: string) =>
  queryKey({ area: "agents", teamId, resource: "federated-identities", id: agentId });

/**
 * Federated identities (PRD Appendix C): projected service-account tokens for a named audience, mounted as a file
 * whose path is in `AFS_FEDERATED_TOKEN_FILE_<NAME>`. AFS stores no credential; the agent exchanges the token itself.
 */
export function FederatedIdentitiesCard({ teamId, agent }: PanelTabProps) {
  const uc = useOptionalService("federatedIdentities");
  const me = useMe();
  const qc = useQueryClient();
  const reason = useTeamWriteGate(teamId).reasonFor("agent-federated-identities:write");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<FederatedIdentityRecord>();
  const list = useQuery({
    queryKey: key(teamId, agent.id),
    queryFn: ({ signal }) =>
      uc ? uc.list(teamId, agent.id, signal) : Promise.reject(new Error("no service")),
    enabled: uc !== undefined && can(me, "agents:read", teamId),
  });
  const del = useMutation({
    mutationFn: (f: FederatedIdentityRecord) =>
      uc ? uc.delete(teamId, agent.id, f) : Promise.reject(new Error("no service")),
    onSettled: () => {
      setRemoving(undefined);
      void qc.invalidateQueries({ queryKey: key(teamId, agent.id) });
    },
  });
  if (!uc) return null;
  const items = list.data ?? [];
  return (
    <Card
      title={`Federated identities (${items.length})`}
      actions={
        <Button disabledReason={reason} onClick={() => setAdding(true)}>
          Add federated identity
        </Button>
      }
    >
      <p>
        A short-lived token for an audience outside AWS (for example an Entra ID or Okta app). The
        agent exchanges it itself; AFS stores no credential.
      </p>
      <ErrorAlert errors={[list.error, del.error]} />
      <Table
        id="agent-federated-identities"
        caption="Federated identities"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        emptyText="No federated identity."
        items={items}
        getRowId={(f) => f.name}
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            cell: (f) => <code>{f.name}</code>,
          },
          { id: "audience", header: "Audience", cell: (f) => <code>{f.audience}</code> },
          { id: "env", header: "Variable", cell: (f) => <code>{f.envVar}</code> },
          { id: "ttl", header: "Lifetime", cell: (f) => `${f.expirationSeconds} s` },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (f) => (
              <Button
                aria-label={`Remove ${f.name}`}
                disabledReason={reason}
                onClick={() => setRemoving(f)}
              >
                Remove
              </Button>
            ),
          },
        ]}
      />
      {adding && (
        <AddDialog
          teamId={teamId}
          agentId={agent.id}
          existing={items.map((f) => f.name)}
          onClose={() => setAdding(false)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}`}
          confirmLabel="Remove"
          onConfirm={() => del.mutate(removing)}
          onCancel={() => setRemoving(undefined)}
        >
          <p>The token file and its variable go on the agent's next restart.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function AddDialog({
  teamId,
  agentId,
  existing,
  onClose,
}: {
  teamId: string;
  agentId: string;
  existing: readonly string[];
  onClose: () => void;
}) {
  const uc = useOptionalService("federatedIdentities");
  const qc = useQueryClient();
  const [d, setD] = useState<FederatedIdentityDraft>({
    name: "",
    audience: "",
    expirationSeconds: "3600",
  });
  const put = useMutation({
    mutationFn: () =>
      uc ? uc.put(teamId, agentId, d, existing) : Promise.reject(new Error("no service")),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key(teamId, agentId) });
      onClose();
    },
  });
  const err = isAppError(put.error) ? put.error : undefined;
  return (
    <Modal
      title="Add federated identity"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={put.isPending} onClick={() => put.mutate()}>
            Add
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && <ErrorAlert errors={[err]} />}
      <FormField
        label="Name"
        hint={d.name ? `${federatedEnvVar(d.name)} → ${federatedFilePath(d.name)}` : undefined}
        error={err?.fields.name}
      >
        <TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </FormField>
      <FormField
        label="Audience"
        hint="Must be allowed by the service (federation.allowed_audiences)"
        error={err?.fields.audience}
      >
        <TextInput value={d.audience} onChange={(e) => setD({ ...d, audience: e.target.value })} />
      </FormField>
      <FormField label="Lifetime in seconds" error={err?.fields.expirationSeconds}>
        <TextInput
          inputMode="numeric"
          value={d.expirationSeconds}
          onChange={(e) => setD({ ...d, expirationSeconds: e.target.value })}
        />
      </FormField>
      <CliPreview command={putFederatedIdentityCli(teamId, agentId, d)} />
    </Modal>
  );
}
