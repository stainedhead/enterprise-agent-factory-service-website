import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { SwarmTemplateRecord } from "../../../application/ports/swarmTemplates.js";
import {
  collaborationChoices,
  draftOf,
  emptyDraft,
  KINDS,
  MAX_TTL_HOURS,
  specOf,
  TEARDOWN_RULES,
  type TemplateDraft,
  validateTemplate,
} from "../../../application/usecases/swarmTemplates/SwarmTemplatesUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import {
  Alert,
  Button,
  CliPreview,
  FormField,
  Modal,
  SelectInput,
  TextInput,
} from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";

/** *Create template* and *Edit template*: the name and kind are fixed once created. */
export function TemplateDialog({
  template,
  busy,
  error,
  onCancel,
  onSave,
}: {
  template?: SwarmTemplateRecord | undefined;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (d: TemplateDraft) => void;
}) {
  const creating = template === undefined;
  const catalog = useOptionalService("adminAgentTemplates");
  const templates = useQuery({
    queryKey: queryKey({ area: "admin-catalogs", resource: "agent-templates" }),
    queryFn: ({ signal }) => (catalog ? catalog.list(signal) : Promise.resolve([])),
    enabled: catalog !== undefined,
  });
  const choices = collaborationChoices(templates.data ?? []);
  // A saved choice that is no longer offered (disabled or lost the capability) stays visible so it can be changed.
  const [d, setD] = useState<TemplateDraft>(template ? draftOf(template) : emptyDraft);
  const [touched, setTouched] = useState(false);
  const errors = validateTemplate(d, creating);
  const server = isAppError(error) && error.kind === "validation" ? error.fields : {};
  const msg = (k: string) => (touched ? errors[k] : undefined) ?? server[k];
  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const save = () => {
    setTouched(true);
    if (Object.keys(errors).length === 0) onSave(d);
  };
  let spec: unknown;
  try {
    spec = errors.spec ? undefined : specOf(d);
  } catch {
    spec = undefined;
  }
  const cli = creating
    ? buildCli("CreateSwarmTemplate", {
        name: d.name || "<name>",
        kind: d.kind,
        description: d.description || undefined,
        budgetUsd: d.budgetUsd || "<budget-usd>",
        ttlHours: /^\d+$/.test(d.ttlHours) ? Number(d.ttlHours) : "<ttl-hours>",
        teardownRule: d.teardownRule,
        spec: spec ?? "<spec>",
      })
    : buildCli("UpdateSwarmTemplate", {
        templateId: template.id,
        description: d.description || undefined,
        budgetUsd: d.budgetUsd || undefined,
        ttlHours: /^\d+$/.test(d.ttlHours) ? Number(d.ttlHours) : undefined,
        teardownRule: d.teardownRule,
        spec: spec ?? undefined,
      });
  return (
    <Modal
      title={creating ? "Create swarm template" : `Edit ${template.name}`}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={save}>
            {creating ? "Create template" : "Save changes"}
          </Button>
        </>
      }
    >
      {isAppError(error) && error.kind !== "validation" && (
        <Alert
          kind="error"
          title={error.isAccessDenied ? "You do not have access" : "The template was not saved"}
          requestId={error.requestId}
        >
          {error.message}
        </Alert>
      )}
      <FormField
        label="Name"
        hint={creating ? "Lower-case letters, digits and hyphens" : "Cannot be changed"}
        error={msg("name")}
      >
        <TextInput
          value={d.name}
          readOnly={!creating}
          onChange={(e) => set("name", e.target.value)}
        />
      </FormField>
      <FormField label="Kind" hint={creating ? undefined : "Cannot be changed"}>
        <SelectInput
          value={d.kind}
          disabled={!creating}
          onChange={(e) => set("kind", e.target.value as TemplateDraft["kind"])}
          options={KINDS}
        />
      </FormField>
      <FormField label="Description">
        <TextInput value={d.description} onChange={(e) => set("description", e.target.value)} />
      </FormField>
      <FormField label="Spend cap (USD)" error={msg("budgetUsd")}>
        <TextInput
          inputMode="decimal"
          value={d.budgetUsd}
          onChange={(e) => set("budgetUsd", e.target.value)}
        />
      </FormField>
      <FormField
        label="Time to live (hours)"
        hint={`1 to ${MAX_TTL_HOURS}`}
        error={msg("ttlHours")}
      >
        <TextInput
          inputMode="numeric"
          value={d.ttlHours}
          onChange={(e) => set("ttlHours", e.target.value)}
        />
      </FormField>
      <FormField label="Teardown">
        <SelectInput
          value={d.teardownRule}
          onChange={(e) => set("teardownRule", e.target.value as TemplateDraft["teardownRule"])}
          options={TEARDOWN_RULES}
        />
      </FormField>
      <FormField
        label="Spec"
        hint="JSON with stages, pools, handoffs, secrets (each with a pool and a name) and configValues"
        error={msg("spec")}
      >
        <textarea
          rows={12}
          spellCheck={false}
          value={d.specText}
          onChange={(e) => set("specText", e.target.value)}
        />
      </FormField>
      <FormField
        label="Collaboration agent"
        hint="Optional. Adds a Paperclip collaboration agent to the remediation team; only enabled agent templates with the paperclip capability are offered."
      >
        <SelectInput
          value={d.collaborationTemplateId}
          onChange={(e) => set("collaborationTemplateId", e.target.value)}
          options={[
            { value: "", label: "None" },
            ...choices,
            ...(d.collaborationTemplateId &&
            !choices.some((c) => c.value === d.collaborationTemplateId)
              ? [
                  {
                    value: d.collaborationTemplateId,
                    label: `${d.collaborationTemplateId} (not available)`,
                  },
                ]
              : []),
          ]}
        />
      </FormField>
      <CliPreview command={cli} />
    </Modal>
  );
}
