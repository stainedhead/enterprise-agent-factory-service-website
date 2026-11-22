import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type {
  LogDestinationFull,
  LogKind,
} from "../../../../../application/ports/logDestinations.js";
import {
  LOG_KIND_FIELDS,
  LOG_NEEDS_SECRET,
} from "../../../../../application/usecases/logDestinations/LogDestinationsUseCases.js";
import {
  Alert,
  Button,
  FormField,
  Modal,
  SelectInput,
  TextInput,
} from "../../../../components/index.js";
import { queryKey } from "../../../../query/keys.js";
import { useOptionalService, useService } from "../../../../services.js";

export const LOG_KINDS: { value: LogKind; label: string }[] = [
  { value: "cloudwatch", label: "CloudWatch Logs" },
  { value: "s3", label: "Amazon S3" },
  { value: "otlp", label: "OpenTelemetry (OTLP)" },
  { value: "splunk_hec", label: "Splunk HEC" },
  { value: "datadog", label: "Datadog" },
];

/** The secret that holds a destination's credential: a reference by name, never a value (WEB-8). */
function useTeamSecrets(teamId: string) {
  const secrets = useOptionalService("secrets");
  return useQuery({
    queryKey: queryKey({ area: "secrets", teamId, resource: "list" }),
    queryFn: ({ signal }) =>
      secrets ? secrets.list(teamId, signal) : Promise.reject(new Error("no secrets service")),
    enabled: secrets !== undefined,
    retry: false,
  });
}

/** Add a log destination or edit one (WEB-US-34.1). The credential is chosen as a secret reference. */
export function DestinationDialog({
  teamId,
  existing,
  onClose,
  onSaved,
}: {
  teamId: string;
  existing: LogDestinationFull | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const logs = useService("logDestinations");
  const secrets = useTeamSecrets(teamId);
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<LogKind>((existing?.kind as LogKind) ?? "cloudwatch");
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(existing?.config ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [secretId, setSecretId] = useState(existing?.secretId ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;
  const fields = LOG_KIND_FIELDS[kind] ?? [];

  const submit = async () => {
    setPending(true);
    try {
      if (existing)
        await logs.update(teamId, existing, { name, config, secretId: secretId || null });
      else await logs.create(teamId, { name, kind, config, secretId: secretId || undefined });
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add destination"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            {existing ? "Save" : "Add destination"}
          </Button>
        </>
      }
    >
      {err && (err.isAccessDenied || Object.keys(err.fields).length === 0) && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The destination was not saved"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField label="Name" error={err?.fields.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Kind">
        <SelectInput
          value={kind}
          disabled={existing !== undefined}
          options={LOG_KINDS}
          onChange={(e) => {
            setKind(e.target.value as LogKind);
            setConfig({});
          }}
        />
      </FormField>
      {fields.map((f) => (
        <FormField key={f.key} label={f.label} hint={f.hint} error={err?.fields[f.key]}>
          <TextInput
            value={config[f.key] ?? ""}
            onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
          />
        </FormField>
      ))}
      <FormField
        label="Credential secret"
        hint={
          LOG_NEEDS_SECRET.has(kind)
            ? "The secret that holds the token or API key. Its value is never shown."
            : "Optional for this kind."
        }
        error={err?.fields.secretId}
      >
        <SelectInput
          value={secretId}
          onChange={(e) => setSecretId(e.target.value)}
          options={[
            { value: "", label: "None" },
            ...(secrets.data ?? []).map((s) => ({ value: s.id, label: s.name })),
            ...(secretId && !(secrets.data ?? []).some((s) => s.id === secretId)
              ? [{ value: secretId, label: secretId }]
              : []),
          ]}
        />
      </FormField>
    </Modal>
  );
}
