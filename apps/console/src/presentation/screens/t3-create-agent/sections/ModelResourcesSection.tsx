import type { ModelRecord } from "../../../../application/ports/teams.js";
import { Card, FormField, SelectInput, TextInput } from "../../../components/index.js";
import type { SectionProps } from "./types.js";

/** *Model and resources*: the team's models only; one pod per agent, so there is no replica field (WEB-US-26.1). */
export function ModelResourcesSection({
  draft,
  set,
  errors,
  models,
}: SectionProps & { models: readonly ModelRecord[] }) {
  return (
    <Card title="Model and resources">
      <FormField label="Model" hint="Enabled for this team" error={errors.modelId}>
        <SelectInput
          value={draft.modelId}
          placeholder="Choose a model"
          options={models.map((m) => ({ value: m.id, label: m.displayName }))}
          onChange={(e) => set({ modelId: e.target.value })}
        />
      </FormField>
      <FormField
        label="CPU"
        hint="One pod per agent. Add agents to add capacity."
        error={errors["resources.cpu"]}
      >
        <TextInput value={draft.cpu} onChange={(e) => set({ cpu: e.target.value })} />
      </FormField>
      <FormField label="Memory" error={errors["resources.memory"]}>
        <TextInput value={draft.memory} onChange={(e) => set({ memory: e.target.value })} />
      </FormField>
    </Card>
  );
}
