import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ApiKeyRecord } from "../../../application/ports/members.js";
import {
  API_KEY_DEFAULT_DAYS,
  API_KEY_MAX_DAYS,
} from "../../../application/usecases/members/MembersUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  Modal,
  OneTimeSecretDialog,
  type OneTimeSecretHandle,
  SelectInput,
  Table,
  TextInput,
} from "../../components/index.js";
import { useDraft } from "../../hooks/useDraft.js";
import { useSecretMutation } from "../../hooks/useSecretMutation.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { DeniedAlert } from "../../query/DeniedAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

const ROLES = [
  { value: "team_viewer", label: "Team viewer" },
  { value: "team_admin", label: "Team admin" },
];
const roleLabel = (r: string) =>
  r === "security_operator" ? "Security operator" : (ROLES.find((x) => x.value === r)?.label ?? r);

/** *API keys* tab: create (the secret is shown once), list and delete (WEB-US-29.2, 29.5). */
export function ApiKeysTab({ teamId }: { teamId: string }) {
  const apiKeys = useService("apiKeys");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const secret = useRef<OneTimeSecretHandle>(null);
  const key = queryKey({ area: "apiKeys", teamId, resource: "api-keys" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => apiKeys.list(teamId, signal) });
  const [dialog, setDialog] = useState<
    | { kind: "create" }
    | { kind: "delete"; k: ApiKeyRecord }
    | { kind: "replayed"; k: ApiKeyRecord }
    | undefined
  >();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const reason = write.reasonFor("api-keys:write");

  const del = useMutation({
    mutationFn: (k: ApiKeyRecord) => apiKeys.delete(teamId, k.id),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });

  return (
    <div>
      <Card
        title="API keys"
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => setDialog({ kind: "create" })}
          >
            Create API key
          </Button>
        }
      >
        {isAppError(del.error) && !del.error.isAccessDenied && (
          <Alert kind="error" title="The key was not deleted" requestId={del.error.requestId}>
            {del.error.message}
          </Alert>
        )}
        <Table
          id="team-api-keys"
          caption="Team API keys"
          filterLabel="Filter API keys"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="No API keys yet."
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (k) => k.name,
              cell: (k) => k.name,
            },
            { id: "prefix", header: "Prefix", cell: (k) => <code>{k.keyPrefix}</code> },
            {
              id: "role",
              header: "Role",
              sortValue: (k) => k.role,
              cell: (k) => roleLabel(k.role),
            },
            {
              id: "expires",
              header: "Expires",
              sortValue: (k) => k.expiresAt,
              cell: (k) => <time dateTime={k.expiresAt}>{formatLocal(k.expiresAt)}</time>,
            },
            {
              id: "used",
              header: "Last used",
              cell: (k) => (k.lastUsedAt ? formatLocal(k.lastUsedAt) : "Never"),
            },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (k) => (
                <Button
                  aria-label={`Delete key ${k.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "delete", k })}
                >
                  Delete
                </Button>
              ),
            },
          ]}
          items={list.data ?? []}
          getRowId={(k) => k.id}
        />
      </Card>
      <OneTimeSecretDialog ref={secret} title="API key created" label="API key" />
      {dialog?.kind === "create" && (
        <CreateKeyDialog
          teamId={teamId}
          onClose={() => setDialog(undefined)}
          onCreated={(r) => {
            void refresh();
            if (r.secretKey !== undefined) {
              setDialog(undefined);
              secret.current?.show(r.secretKey);
            } else setDialog({ kind: "replayed", k: r.key });
          }}
        />
      )}
      {dialog?.kind === "replayed" && (
        <Modal
          title="API key created"
          onClose={() => setDialog(undefined)}
          actions={
            <>
              <Button onClick={() => setDialog(undefined)}>Close</Button>
              <Button variant="primary" onClick={() => setDialog({ kind: "delete", k: dialog.k })}>
                Delete key
              </Button>
            </>
          }
        >
          <p role="alert">
            The key <strong>{dialog.k.name}</strong> was created, but its secret cannot be shown
            again. Delete the key and create a new one to get a secret.
          </p>
        </Modal>
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete key ${dialog.k.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.k)}
        >
          Anything using this key stops working.
        </ConfirmDialog>
      )}
    </div>
  );
}

interface KeyDraft {
  name: string;
  role: string;
  days: string;
}

function CreateKeyDialog({
  teamId,
  onClose,
  onCreated,
}: {
  teamId: string;
  onClose: () => void;
  onCreated: (r: { key: ApiKeyRecord; secretKey: string | undefined }) => void;
}) {
  const apiKeys = useService("apiKeys");
  // Non-secret fields survive a session expiry (FR-004); the key itself never enters state or a draft.
  const draft = useDraft<KeyDraft>(`t6-create-api-key:${teamId}`, {
    name: "",
    role: "team_viewer",
    days: String(API_KEY_DEFAULT_DAYS),
  });
  const { name, role, days } = draft.value;
  const set = (patch: Partial<KeyDraft>) => draft.setValue((d) => ({ ...d, ...patch }));
  const close = () => {
    draft.discard();
    onClose();
  };
  // the secret never enters React state: the mutation hands it straight to `onCreated`
  const create = useSecretMutation((d: { name: string; role: string; days: string }) =>
    apiKeys.create(teamId, d),
  );
  const err = isAppError(create.error) ? create.error : undefined;
  const n = Number(days);
  const cli = buildCli("CreateApiKey", {
    teamId,
    name: name || "<name>",
    role,
    expiresAt:
      Number.isInteger(n) && n >= 1 && n <= API_KEY_MAX_DAYS ? apiKeys.expiryFor(n) : "<expiry>",
  });

  return (
    <Modal
      title="Create API key"
      onClose={close}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={create.pending}
            onClick={async () => {
              const r = await create.run({ name, role, days });
              if (r) {
                draft.discard();
                onCreated(r);
              }
            }}
          >
            Create key
          </Button>
        </>
      }
    >
      {err?.isAccessDenied && <DeniedAlert error={err} />}
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The key was not created" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField label="Name" error={err?.fields.name}>
        <TextInput value={name} onChange={(e) => set({ name: e.target.value })} />
      </FormField>
      <FormField label="Role" error={err?.fields.role}>
        <SelectInput value={role} options={ROLES} onChange={(e) => set({ role: e.target.value })} />
      </FormField>
      <FormField
        label="Expires in (days)"
        hint={`Up to ${API_KEY_MAX_DAYS} days; ${API_KEY_DEFAULT_DAYS} by default`}
        error={err?.fields.expiresAt}
      >
        <TextInput
          inputMode="numeric"
          value={days}
          onChange={(e) => set({ days: e.target.value })}
        />
      </FormField>
      <CliPreview command={cli} />
    </Modal>
  );
}
