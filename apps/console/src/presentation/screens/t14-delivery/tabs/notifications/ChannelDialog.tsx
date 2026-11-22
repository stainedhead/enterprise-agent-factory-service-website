import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { ChannelKind, ChannelRecord } from "../../../../../application/ports/notifications.js";
import {
  KIND_FIELDS,
  NEEDS_SECRET,
  parseEvents,
} from "../../../../../application/usecases/notifications/NotificationsUseCases.js";
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

export const KINDS: { value: ChannelKind; label: string }[] = [
  { value: "slack", label: "Slack" },
  { value: "email", label: "Email" },
  { value: "webhook", label: "Webhook" },
  { value: "jira", label: "Jira" },
  { value: "eventbridge", label: "EventBridge" },
];

/** The secret that holds a channel's credential: a reference by name, never a value (WEB-8). */
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

/** Add a channel or edit one (WEB-US-34.2). The credential is chosen as a secret reference. */
export function ChannelDialog({
  teamId,
  existing,
  onClose,
  onSaved,
}: {
  teamId: string;
  existing: ChannelRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const notifications = useService("notifications");
  const secrets = useTeamSecrets(teamId);
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<ChannelKind>((existing?.kind as ChannelKind) ?? "slack");
  const [events, setEvents] = useState((existing?.eventTypes ?? ["budget.*"]).join(", "));
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(existing?.config ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [secretId, setSecretId] = useState(existing?.secretId ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;
  const fields = KIND_FIELDS[kind] ?? [];

  const submit = async () => {
    setPending(true);
    try {
      const eventTypes = parseEvents(events);
      if (existing)
        await notifications.update(teamId, existing, {
          name,
          eventTypes,
          config,
          secretId: secretId || null,
        });
      else
        await notifications.create(teamId, {
          name,
          kind,
          eventTypes,
          config,
          secretId: secretId || undefined,
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
      title={existing ? `Edit ${existing.name}` : "Add channel"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            {existing ? "Save" : "Add channel"}
          </Button>
        </>
      }
    >
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The channel was not saved" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {err?.isAccessDenied && (
        <Alert kind="error" title="You do not have access" requestId={err.requestId}>
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
          options={KINDS}
          onChange={(e) => {
            setKind(e.target.value as ChannelKind);
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
        label="Events"
        hint="Comma-separated event types or prefixes, for example budget.*, agent.failed"
        error={err?.fields.eventTypes}
      >
        <TextInput value={events} onChange={(e) => setEvents(e.target.value)} />
      </FormField>
      <FormField
        label="Credential secret"
        hint={
          NEEDS_SECRET.has(kind)
            ? "The secret that holds the token or webhook credential. Its value is never shown."
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
