import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../application/errors.js";
import type { Cadence } from "../../../../application/ports/reportSchedules.js";
import type { ReportKind, ReportQuery } from "../../../../application/ports/reports.js";
import {
  Alert,
  Button,
  FormField,
  Modal,
  SelectInput,
  TextInput,
} from "../../../components/index.js";
import { queryKey } from "../../../query/keys.js";
import { useOptionalService, useService } from "../../../services.js";

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/**
 * *Schedule report* (WEB-US-37.6): the report as it is now configured is delivered as CSV to one of the
 * team's own notification channels. The API refuses a service-level channel; the refusal shows on the field.
 */
export function ScheduleDialog({
  teamId,
  kind,
  title,
  query,
  onClose,
  onSaved,
}: {
  teamId: string;
  kind: ReportKind;
  title: string;
  query: ReportQuery;
  onClose: () => void;
  onSaved: () => void;
}) {
  const schedules = useService("reportSchedules");
  const notifications = useOptionalService("notifications");
  const channels = useQuery({
    queryKey: queryKey({ area: "notifications", teamId, resource: "channels" }),
    queryFn: ({ signal }) =>
      notifications ? notifications.list(teamId, signal) : Promise.reject(new Error("no channels")),
    enabled: notifications !== undefined,
    retry: false,
  });
  const [name, setName] = useState(title);
  const [channelId, setChannelId] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;

  const submit = async () => {
    setPending(true);
    try {
      await schedules.create(teamId, { name, report: kind, cadence, channelId, query });
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      title="Schedule report"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            Schedule
          </Button>
        </>
      }
    >
      {err && (err.isAccessDenied || Object.keys(err.fields).length === 0) && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The schedule was not saved"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <p>The report with the controls you have set now is sent as CSV on each run.</p>
      <FormField label="Name" error={err?.fields.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Cadence">
        <SelectInput
          value={cadence}
          options={CADENCES}
          onChange={(e) => setCadence(e.target.value as Cadence)}
        />
      </FormField>
      <FormField
        label="Channel"
        hint="One of this team's notification channels"
        error={err?.fields.channelId}
      >
        <SelectInput
          value={channelId}
          placeholder="Choose a channel"
          options={(channels.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          onChange={(e) => setChannelId(e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
