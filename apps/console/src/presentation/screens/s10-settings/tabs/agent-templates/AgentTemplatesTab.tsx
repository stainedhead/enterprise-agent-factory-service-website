import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { AgentTemplateRecord } from "../../../../../application/ports/agents.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  Modal,
  SelectInput,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";

const key = queryKey({ area: "admin-catalogs", resource: "agent-templates" });
const shortDigest = (d: string) => `${d.slice(0, 14)}…`;

/** S10 *Agent templates* (WEB-US-20.4, WEB-US-22.1): add, edit, enable or disable and remove. */
export function AgentTemplatesTab() {
  const svc = useService("adminAgentTemplates");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:agent-templates");
  const [dialog, setDialog] = useState<
    | { kind: "edit"; t?: AgentTemplateRecord }
    | { kind: "delete"; t: AgentTemplateRecord }
    | undefined
  >();
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => svc.list(signal) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (t: AgentTemplateRecord) => svc.setEnabled(t, !t.enabled),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (t: AgentTemplateRecord) => svc.delete(t),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  return (
    <Card
      title="Agent templates"
      actions={
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "edit" })}
        >
          Add agent template
        </Button>
      }
    >
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Table
        id="agent-templates"
        caption="Agent templates"
        filterLabel="Find agent templates"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No agent templates."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (t) => t.name,
            cell: (t) => t.name,
          },
          { id: "harness", header: "Harness", sortValue: (t) => t.harness, cell: (t) => t.harness },
          {
            id: "digest",
            header: "Current digest",
            cell: (t) => <code title={t.currentDigest}>{shortDigest(t.currentDigest)}</code>,
            text: (t) => t.currentDigest,
          },
          {
            id: "allowed",
            header: "Allowed digests",
            sortValue: (t) => t.allowedDigests.length,
            cell: (t) => t.allowedDigests.length,
          },
          {
            id: "capabilities",
            header: "Capabilities",
            text: (t) => (t.capabilities ?? []).join(" "),
            cell: (t) =>
              (t.capabilities ?? []).length > 0
                ? (t.capabilities ?? []).map((c) => <Badge key={c}>{c}</Badge>)
                : "—",
          },
          {
            id: "state",
            header: "State",
            text: (t) => (t.enabled ? "Enabled" : "Disabled"),
            cell: (t) => (t.enabled ? "Enabled" : <Badge>Disabled</Badge>),
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (t) => (
              <>
                <Button
                  aria-label={`${t.enabled ? "Disable" : "Enable"} ${t.name}`}
                  disabledReason={reason}
                  onClick={() => toggle.mutate(t)}
                >
                  {t.enabled ? "Disable" : "Enable"}
                </Button>{" "}
                <Button
                  aria-label={`Edit ${t.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "edit", t })}
                >
                  Edit
                </Button>{" "}
                <Button
                  aria-label={`Delete ${t.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "delete", t })}
                >
                  Delete
                </Button>
              </>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(t) => t.name}
      />
      {dialog?.kind === "edit" && (
        <TemplateDialog
          existing={dialog.t}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.t.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.t)}
        >
          Existing agents keep running but show Template retired.
        </ConfirmDialog>
      )}
    </Card>
  );
}

function TemplateDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: AgentTemplateRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const svc = useService("adminAgentTemplates");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [harness, setHarness] = useState(existing?.harness ?? "");
  const [cpu, setCpu] = useState(existing?.defaultResources?.cpu ?? "");
  const [memory, setMemory] = useState(existing?.defaultResources?.memory ?? "");
  const [digests, setDigests] = useState((existing?.allowedDigests ?? []).join("\n"));
  const [current, setCurrent] = useState(existing?.currentDigest ?? "");
  const [paperclip, setPaperclip] = useState(
    existing?.capabilities?.includes("paperclip") ?? false,
  );
  const allowed = digests
    .split(/[\s,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
  const save = useMutation({
    mutationFn: () =>
      svc.put(
        name,
        {
          harness,
          description,
          allowedDigests: allowed,
          currentDigest: current || allowed[0] || "",
          enabled: existing?.enabled ?? true,
          capabilities: [
            ...(existing?.capabilities ?? []).filter((c) => c !== "paperclip"),
            ...(paperclip ? ["paperclip"] : []),
          ],
          ...((cpu || memory) && {
            defaultResources: { ...(cpu && { cpu }), ...(memory && { memory }) },
          }),
        },
        existing,
      ),
    onSuccess: onSaved,
  });
  const err = isAppError(save.error) ? save.error : undefined;
  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add agent template"}
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
        <Alert kind="error" title="The template was not saved" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField label="Name" error={err?.fields.name}>
        <TextInput
          value={name}
          readOnly={existing !== undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="Description">
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <FormField label="Harness" error={err?.fields.harness}>
        <TextInput value={harness} onChange={(e) => setHarness(e.target.value)} />
      </FormField>
      <fieldset>
        <legend>Capabilities</legend>
        <label>
          <input
            type="checkbox"
            checked={paperclip}
            onChange={(e) => setPaperclip(e.target.checked)}
          />{" "}
          paperclip
        </label>
        <p>
          Only templates with the paperclip capability can be used for a collaboration agent, and
          they cannot be used for workers.
        </p>
      </fieldset>
      <FormField label="Default CPU" hint="Optional, for example 2">
        <TextInput value={cpu} onChange={(e) => setCpu(e.target.value)} />
      </FormField>
      <FormField label="Default memory" hint="Optional, for example 8Gi">
        <TextInput value={memory} onChange={(e) => setMemory(e.target.value)} />
      </FormField>
      <FormField
        label="Allowed digests"
        hint="Separate with commas: sha256:<64 hex digits>"
        error={err?.fields.allowedDigests}
      >
        <TextInput
          value={digests.replace(/\n/g, ", ")}
          onChange={(e) => setDigests(e.target.value)}
        />
      </FormField>
      <FormField label="Current digest" error={err?.fields.currentDigest}>
        <SelectInput
          value={current}
          placeholder={allowed.length ? "First allowed digest" : "Enter allowed digests first"}
          options={allowed.map((d) => ({ value: d, label: shortDigest(d) }))}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
