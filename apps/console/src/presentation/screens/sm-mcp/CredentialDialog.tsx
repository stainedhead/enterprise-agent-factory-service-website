// The write-only credential dialog of the MCP screens: a static key, or an OAuth client id and secret. The values
// live only in the masked inputs and are read at submit (useSecretMutation); nothing is kept after the request.
import { useRef, useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { CredentialInput } from "../../../application/ports/mcp.js";
import type { CliCommand } from "../../../domain/cli.js";
import {
  Alert,
  Button,
  CliPreview,
  FormField,
  Modal,
  SecretInput,
  type SecretInputHandle,
  TextInput,
} from "../../components/index.js";
import { useSecretMutation } from "../../hooks/useSecretMutation.js";
import { ErrorAlert } from "./shared.js";

export function CredentialDialog({
  title,
  authKind,
  cli,
  save,
  onSaved,
  onClose,
}: {
  title: string;
  authKind: string;
  cli: CliCommand;
  save: (c: CredentialInput) => Promise<unknown>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const value = useRef<SecretInputHandle>(null);
  const secret = useRef<SecretInputHandle>(null);
  const [clientId, setClientId] = useState("");
  const put = useSecretMutation((c: CredentialInput) => save(c));
  const err = isAppError(put.error) ? put.error : undefined;
  const client = authKind === "oauth_client";
  const close = () => {
    value.current?.clear();
    secret.current?.clear();
    onClose();
  };
  return (
    <Modal
      title={title}
      onClose={close}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={put.pending}
            onClick={async () => {
              const r = await put.run(
                client
                  ? { clientId, clientSecret: secret.current?.read() ?? "" }
                  : { value: value.current?.read() ?? "" },
              );
              if (r !== undefined) {
                onSaved();
                onClose();
              }
            }}
          >
            Save credential
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <ErrorAlert errors={[err]} title="The credential was not saved" />
      )}
      <Alert kind="info" title="Write-only">
        The team gateway keeps the credential at a path agents cannot read. It is never shown again
        and never reaches an agent.
      </Alert>
      {client ? (
        <>
          <FormField label="Client id" error={err?.fields.clientId}>
            <TextInput value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </FormField>
          <FormField label="Client secret" error={err?.fields.clientSecret}>
            <SecretInput ref={secret} />
          </FormField>
        </>
      ) : (
        <FormField label="API key" error={err?.fields.value}>
          <SecretInput ref={value} />
        </FormField>
      )}
      <CliPreview command={cli} />
    </Modal>
  );
}
