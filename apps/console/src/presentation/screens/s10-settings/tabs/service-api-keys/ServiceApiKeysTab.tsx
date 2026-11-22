import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { ApiKeyRecord } from "../../../../../application/ports/adminApiKeys.js";
import {
  SERVICE_KEY_DEFAULT_DAYS,
  SERVICE_KEY_MAX_DAYS,
} from "../../../../../application/usecases/adminApiKeys/AdminApiKeysUseCases.js";
import { buildCli } from "../../../../../domain/cli.js";
import { formatLocal } from "../../../../../domain/time.js";
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
  Table,
  TextInput,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { useSecretMutation } from "../../../../hooks/useSecretMutation.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";

const key = queryKey({ area: "admin-apiKeys", resource: "list" });

/**
 * S10 *Service API keys* (WEB-US-20.5): service-level keys, always with the security operator role, for automation
 * that raises work orders. The secret is shown once, in a dialog, and is never kept.
 */
export function ServiceApiKeysTab() {
  const svc = useService("adminApiKeys");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:settings");
  const secret = useRef<OneTimeSecretHandle>(null);
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => svc.list(signal) });
  const [dialog, setDialog] = useState<
    | { kind: "create" }
    | { kind: "delete"; k: ApiKeyRecord }
    | { kind: "replayed"; k: ApiKeyRecord }
    | undefined
  >();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const del = useMutation({
    mutationFn: (k: ApiKeyRecord) => svc.delete(k.id),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [list.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);

  return (
    <Card
      title="Service API keys"
      actions={
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "create" })}
        >
          Create service API key
        </Button>
      }
    >
      <p>
        Service keys act as a security operator, for example to raise work orders from a pipeline.
        Each lasts at most {SERVICE_KEY_MAX_DAYS} days.
      </p>
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The request failed"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Table<ApiKeyRecord>
        id="service-api-keys"
        caption="Service API keys"
        filterLabel="Find service API keys"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        emptyText="No service API keys yet."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (k) => k.name,
            text: (k) => k.name,
            cell: (k) => k.name,
          },
          { id: "prefix", header: "Prefix", cell: (k) => <code>{k.keyPrefix}</code> },
          { id: "role", header: "Role", cell: () => "Security operator" },
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
      <OneTimeSecretDialog ref={secret} title="Service API key created" label="Service API key" />
      {dialog?.kind === "create" && (
        <CreateDialog
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
          title="Service API key created"
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
          <p>Anything using this key stops working.</p>
          <CliPreview command={buildCli("DeleteServiceApiKey", { keyId: dialog.k.id })} />
        </ConfirmDialog>
      )}
    </Card>
  );
}

function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: { key: ApiKeyRecord; secretKey: string | undefined }) => void;
}) {
  const svc = useService("adminApiKeys");
  const [name, setName] = useState("");
  const [days, setDays] = useState(String(SERVICE_KEY_DEFAULT_DAYS));
  // the secret never enters React state: the mutation hands it straight to `onCreated`
  const create = useSecretMutation((d: { name: string; days: string }) => svc.create(d));
  const err = isAppError(create.error) ? create.error : undefined;
  const n = Number(days);
  const cli = buildCli("CreateServiceApiKey", {
    name: name || "<name>",
    role: "security_operator",
    expiresAt:
      Number.isInteger(n) && n >= 1 && n <= SERVICE_KEY_MAX_DAYS ? svc.expiryFor(n) : "<expiry>",
  });
  return (
    <Modal
      title="Create service API key"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={create.pending}
            onClick={async () => {
              const r = await create.run({ name, days });
              if (r) onCreated(r);
            }}
          >
            Create key
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The key was not created"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField label="Name" error={err?.fields.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Role" hint="Service keys can only be security operators">
        <TextInput value="Security operator" readOnly />
      </FormField>
      <FormField
        label="Expires in (days)"
        hint={`Up to ${SERVICE_KEY_MAX_DAYS} days; ${SERVICE_KEY_DEFAULT_DAYS} by default`}
        error={err?.fields.expiresAt}
      >
        <TextInput inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </FormField>
      <CliPreview command={cli} />
    </Modal>
  );
}
