import type { AgentTemplateRecord } from "../../../../application/ports/agents.js";
import { Card, FormField, SelectInput, TextInput } from "../../../components/index.js";
import type { SectionProps } from "./types.js";

/** *Agent*: name, template (enabled ones, defaults prefilled), image digest and persona (WEB-US-26.1, 22.2). */
export function AgentSection({
  draft,
  set,
  errors,
  templates,
  onTemplate,
}: SectionProps & {
  templates: readonly AgentTemplateRecord[];
  onTemplate: (name: string) => void;
}) {
  const enabled = templates.filter((t) => t.enabled);
  const current = enabled.find((t) => t.name === draft.template);
  return (
    <Card title="Agent">
      <FormField label="Name" error={errors.name}>
        <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      </FormField>
      <FormField
        label="Template"
        hint="From the Agentic Teammates runtime catalog"
        error={errors.template}
      >
        <SelectInput
          value={draft.template}
          placeholder="Choose a template"
          options={enabled.map((t) => ({ value: t.name, label: t.name }))}
          onChange={(e) => onTemplate(e.target.value)}
        />
      </FormField>
      <FormField label="Image" hint="Pinned by digest. Tags are not accepted." error={errors.image}>
        <TextInput
          list="create-agent-digests"
          value={draft.image}
          onChange={(e) => set({ image: e.target.value })}
        />
      </FormField>
      <datalist id="create-agent-digests">
        {(current?.allowedDigests ?? []).map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <FormField label="Persona and instructions" error={errors.description}>
        <textarea
          rows={3}
          value={draft.persona}
          onChange={(e) => set({ persona: e.target.value })}
          style={{ width: "100%" }}
        />
      </FormField>
    </Card>
  );
}
