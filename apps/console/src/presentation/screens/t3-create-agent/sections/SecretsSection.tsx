import type { SecretRecord } from "../../../../application/ports/secrets.js";
import type { BindingRow } from "../../../../application/usecases/agents-create/CreateAgentUseCases.js";
import {
  Badge,
  Button,
  Card,
  FormField,
  SelectInput,
  TextInput,
} from "../../../components/index.js";
import type { RowEditProps, SectionProps } from "./types.js";

/**
 * *Secrets* (WEB-US-26.3): bindings to team-shared secrets (and this agent's own, which can only exist after
 * the agent does); the target is an environment variable name or a file path.
 */
export function SecretsSection({
  draft,
  set,
  errors,
  secrets,
  readOnlyReason,
}: SectionProps & RowEditProps & { secrets: readonly SecretRecord[] }) {
  const usable = secrets.filter((s) => s.scope === "team");
  const change = (i: number, patch: Partial<BindingRow>) =>
    set({ bindings: draft.bindings.map((b, n) => (n === i ? { ...b, ...patch } : b)) });
  return (
    <Card
      title="Secrets"
      actions={
        <Button
          disabledReason={readOnlyReason}
          onClick={() =>
            set({ bindings: [...draft.bindings, { secretId: "", delivery: "env", target: "" }] })
          }
        >
          Add secret binding
        </Button>
      }
    >
      <p>
        Team-shared secrets can be bound now. Secrets only this agent can read are added after it is
        created, under Secrets.
      </p>
      {draft.bindings.map((b, i) => {
        const key = `${i}`;
        return (
          <div
            key={key}
            style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}
          >
            <FormField label={`Secret ${i + 1}`} error={errors[`binding.${i}.secretId`]}>
              <SelectInput
                value={b.secretId}
                placeholder="Choose a secret"
                options={usable.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(e) => change(i, { secretId: e.target.value })}
              />
            </FormField>
            <Badge>Team shared</Badge>
            <FormField label={`Delivery of secret ${i + 1}`}>
              <SelectInput
                value={b.delivery}
                options={[
                  { value: "env", label: "Environment variable" },
                  { value: "file", label: "File" },
                ]}
                onChange={(e) => change(i, { delivery: e.target.value as BindingRow["delivery"] })}
              />
            </FormField>
            <FormField
              label={`Target of secret ${i + 1}`}
              hint={b.delivery === "env" ? "Environment variable name" : "File path"}
              error={errors[`binding.${i}.target`]}
            >
              <TextInput value={b.target} onChange={(e) => change(i, { target: e.target.value })} />
            </FormField>
            <Button
              aria-label={`Remove secret binding ${i + 1}`}
              onClick={() => set({ bindings: draft.bindings.filter((_, n) => n !== i) })}
            >
              Remove
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
