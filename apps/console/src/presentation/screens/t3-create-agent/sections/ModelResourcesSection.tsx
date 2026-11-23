import type { ModelRecord } from "../../../../application/ports/teams.js";
import { validateModels } from "../../../../domain/modelAccess.js";
import { Card, FormField, ModelsControl, TextInput } from "../../../components/index.js";
import type { SectionProps } from "./types.js";

/**
 * *Models and resources*: All or Selected from the team's models and a default model (MOD-3); one pod per agent,
 * so there is no replica field (WEB-US-26.1).
 */
export function ModelResourcesSection({
  draft,
  set,
  errors,
  models,
}: SectionProps & { models: readonly ModelRecord[] }) {
  const spec = {
    access: draft.modelAccess,
    modelIds: draft.modelIds,
    defaultModelId: draft.defaultModelId,
  };
  const local =
    models.length > 0
      ? validateModels(
          spec,
          models.map((m) => m.id),
        )
      : {};
  return (
    <Card title="Models and resources">
      <ModelsControl
        value={spec}
        allowed={models}
        errors={{
          models:
            errors.models ?? (errors["models.modelIds"] ? errors["models.modelIds"] : local.models),
          defaultModelId: errors.defaultModelId ?? errors["models.defaultModelId"],
        }}
        onChange={(m) =>
          set({
            modelAccess: m.access,
            modelIds: [...m.modelIds],
            defaultModelId: m.defaultModelId,
          })
        }
      />
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
