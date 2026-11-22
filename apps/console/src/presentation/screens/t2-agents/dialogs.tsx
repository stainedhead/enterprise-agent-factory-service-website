import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type AppError, isAppError } from "../../../application/errors.js";
import type { AgentRecord, UpdateAgentInput } from "../../../application/ports/agents.js";
import { isTemplateRetired } from "../../../application/usecases/agents/AgentsUseCases.js";
import {
  Alert,
  Button,
  ConfirmDialog,
  FormField,
  Modal,
  SelectInput,
  TextInput,
} from "../../components/index.js";
import { useVersionedForm } from "../../hooks/useVersionedForm.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

/** *Expand volume* (WEB-US-25.3): only a larger size; the API's own refusal is shown as it came. */
export function ExpandVolumeDialog({
  current,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  current: number;
  pending: boolean;
  error: AppError | undefined;
  onCancel: () => void;
  onSubmit: (sizeGiB: number) => void;
}) {
  const [size, setSize] = useState(String(current + 10));
  const n = Number(size);
  // a smaller or equal size is refused here, before any request
  const tooSmall = size.trim() === "" || !Number.isFinite(n) || n <= current;
  return (
    <Modal
      title="Expand volume"
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={pending}
            disabledReason={tooSmall ? `Enter more than ${current} GiB` : undefined}
            onClick={() => onSubmit(n)}
          >
            Expand
          </Button>
        </>
      }
    >
      {error && !error.isAccessDenied && (
        <Alert kind="error" title="The volume was not expanded" requestId={error.requestId}>
          {error.message}
        </Alert>
      )}
      <FormField
        label="New size (GiB)"
        hint={`Currently ${current} GiB. A volume can grow but never shrink.`}
        error={error?.fields["volume.sizeGiB"]}
      >
        <TextInput inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value)} />
      </FormField>
    </Modal>
  );
}

/** *Take snapshot*: an optional description. */
export function SnapshotDialog({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (description: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <Modal
      title="Take snapshot"
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={() => onSubmit(text)}>
            Take snapshot
          </Button>
        </>
      }
    >
      <FormField label="Description" hint="Optional">
        <TextInput value={text} onChange={(e) => setText(e.target.value)} />
      </FormField>
    </Modal>
  );
}

/** Confirmation for *Pause* and *Resume*. */
export function PauseDialog({
  resume,
  name,
  onCancel,
  onConfirm,
}: {
  resume: boolean;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title={`${resume ? "Resume" : "Pause"} ${name}`}
      confirmLabel={resume ? "Resume" : "Pause"}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {resume
        ? "The agent starts again with its volume."
        : "The agent's pod stops. Its volume and configuration are kept, and it stops using the budget."}
    </ConfirmDialog>
  );
}

interface EditDraft {
  description: string;
  template: string;
  image: string;
  modelId: string;
  cpu: string;
  memory: string;
}

const toDraft = (a: AgentRecord): EditDraft => ({
  description: a.description ?? "",
  template: a.template,
  image: a.image,
  modelId: a.modelId,
  cpu: a.resources?.cpu ?? "",
  memory: a.resources?.memory ?? "",
});

/** The fields that differ from the agent as loaded (a `PATCH` sends only these). */
export function changedFields(a: AgentRecord, d: EditDraft): UpdateAgentInput {
  const out: {
    -readonly [K in keyof UpdateAgentInput]: UpdateAgentInput[K];
  } = {};
  if (d.description !== (a.description ?? "")) out.description = d.description;
  if (d.template !== a.template) out.template = d.template;
  if (d.image.trim() !== a.image) out.image = d.image.trim();
  if (d.modelId !== a.modelId) out.modelId = d.modelId;
  if (d.cpu !== (a.resources?.cpu ?? "") || d.memory !== (a.resources?.memory ?? ""))
    out.resources = { ...(d.cpu && { cpu: d.cpu }), ...(d.memory && { memory: d.memory }) };
  return out;
}

/** *Edit* (WEB-US-25.2, 22.3): a retired template needs a new template or image digest before saving. */
export function EditAgentDialog({
  teamId,
  agent,
  onClose,
  onSaved,
}: {
  teamId: string;
  agent: AgentRecord;
  onClose: () => void;
  onSaved: (a: AgentRecord) => void;
}) {
  const agents = useService("agents");
  const teams = useService("teams");
  const templates = useQuery({
    queryKey: queryKey({ area: "agents", resource: "templates" }),
    queryFn: ({ signal }) => agents.templates(signal),
  });
  const models = useQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "models" }),
    queryFn: ({ signal }) => teams.models(teamId, signal),
  });
  const retired = isTemplateRetired(agent);
  const form = useVersionedForm<AgentRecord, EditDraft>({
    initial: agent,
    toDraft,
    save: (d, version) => agents.update(teamId, { id: agent.id, version }, changedFields(agent, d)),
    reload: () => agents.get(teamId, agent.id),
    onSaved,
  });
  const d = form.draft;
  const set = (p: Partial<EditDraft>) => form.setDraft({ ...d, ...p });
  const changed = Object.keys(changedFields(agent, d)).length > 0;
  const needsNew = retired && d.template === agent.template && d.image.trim() === agent.image;
  const err = isAppError(form.error) ? form.error : undefined;
  const tpl = (templates.data ?? []).filter((t) => t.enabled || t.name === agent.template);
  const selected = tpl.find((t) => t.name === d.template);

  return (
    <Modal
      title={`Edit ${agent.name}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={form.saving || form.stale}
            disabledReason={
              needsNew
                ? "Choose a new template or image digest"
                : !changed
                  ? "Nothing changed"
                  : undefined
            }
            onClick={() => void form.submit()}
          >
            Save
          </Button>
        </>
      }
    >
      {retired && (
        <Alert kind="warning" title="Template retired">
          Choose a new template or image digest before saving.
        </Alert>
      )}
      {form.stale && <ConflictAlert onReload={() => void form.reload()} />}
      {err &&
        !err.isAccessDenied &&
        err.kind !== "stale" &&
        Object.keys(err.fields).length === 0 && (
          <Alert kind="error" title="The agent was not saved" requestId={err.requestId}>
            {err.message}
          </Alert>
        )}
      <FormField label="Description" error={form.fieldErrors.description}>
        <TextInput value={d.description} onChange={(e) => set({ description: e.target.value })} />
      </FormField>
      <FormField label="Template" error={form.fieldErrors.template}>
        <SelectInput
          value={d.template}
          options={tpl.map((t) => ({
            value: t.name,
            label: t.enabled ? t.name : `${t.name} (retired)`,
          }))}
          onChange={(e) => {
            const t = tpl.find((x) => x.name === e.target.value);
            set({ template: e.target.value, ...(t && { image: t.currentDigest }) });
          }}
        />
      </FormField>
      <FormField
        label="Image"
        hint="Pinned by digest. Tags are not accepted."
        error={form.fieldErrors.image}
      >
        <TextInput
          list="edit-agent-digests"
          value={d.image}
          onChange={(e) => set({ image: e.target.value })}
        />
      </FormField>
      <datalist id="edit-agent-digests">
        {(selected?.allowedDigests ?? []).map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <FormField label="Model" error={form.fieldErrors.modelId}>
        <SelectInput
          value={d.modelId}
          options={[
            ...(models.data ?? []).map((m) => ({ value: m.id, label: m.displayName })),
            ...((models.data ?? []).some((m) => m.id === d.modelId)
              ? []
              : [{ value: d.modelId, label: d.modelId }]),
          ]}
          onChange={(e) => set({ modelId: e.target.value })}
        />
      </FormField>
      <FormField label="CPU" error={form.fieldErrors["resources.cpu"]}>
        <TextInput value={d.cpu} onChange={(e) => set({ cpu: e.target.value })} />
      </FormField>
      <FormField label="Memory" error={form.fieldErrors["resources.memory"]}>
        <TextInput value={d.memory} onChange={(e) => set({ memory: e.target.value })} />
      </FormField>
    </Modal>
  );
}
