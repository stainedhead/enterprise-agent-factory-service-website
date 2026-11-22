import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { ChannelKind, ChannelRecord } from "../../../../../application/ports/notifications.js";
import { SERVICE_CHANNEL_KINDS } from "../../../../../application/usecases/adminNotificationChannels/AdminNotificationChannelsUseCases.js";
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
import { useService } from "../../../../services.js";

const LABELS: Record<string, string> = {
  email: "Email",
  slack: "Slack",
  webhook: "Webhook",
  jira: "Jira",
};

/** Add or edit a service channel (WEB-US-20.7). The credential is a secret reference, never a value. */
export function ServiceChannelDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: ChannelRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const channels = useService("adminNotificationChannels");
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<ChannelKind>((existing?.kind as ChannelKind) ?? "email");
  const [events, setEvents] = useState((existing?.eventTypes ?? ["budget.*"]).join(", "));
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(existing?.config ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [secretId, setSecretId] = useState(existing?.secretId ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;

  const submit = async () => {
    setPending(true);
    try {
      const eventTypes = parseEvents(events);
      if (existing)
        await channels.update(existing, { name, eventTypes, config, secretId: secretId || null });
      else
        await channels.create({ name, kind, eventTypes, config, secretId: secretId || undefined });
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
      {err && (err.isAccessDenied || Object.keys(err.fields).length === 0) && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The channel was not saved"}
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
          options={SERVICE_CHANNEL_KINDS.map((k) => ({ value: k, label: LABELS[k] ?? k }))}
          onChange={(e) => {
            setKind(e.target.value as ChannelKind);
            setConfig({});
          }}
        />
      </FormField>
      {(KIND_FIELDS[kind] ?? []).map((f) => (
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
            ? "The reference of the secret that holds the credential. Its value is never shown."
            : "Optional for this kind."
        }
        error={err?.fields.secretId}
      >
        <TextInput value={secretId} onChange={(e) => setSecretId(e.target.value)} />
      </FormField>
    </Modal>
  );
}
