import type { ConfigValueRecord } from "../../../../application/ports/configValues.js";
import type { ConfigRow } from "../../../../application/usecases/agents-create/CreateAgentUseCases.js";
import { Button, Card, FormField, SelectInput, TextInput } from "../../../components/index.js";
import type { RowEditProps, SectionProps } from "./types.js";

/**
 * *Configuration values* (WEB-US-26.5): *Use namespace value* is offered only for a name the namespace has,
 * with the effective value beside the name; otherwise the agent holds its own value.
 */
export function ConfigSection({
  draft,
  set,
  errors,
  namespace,
  readOnlyReason,
}: SectionProps & RowEditProps & { namespace: readonly ConfigValueRecord[] }) {
  const change = (i: number, patch: Partial<ConfigRow>) =>
    set({ config: draft.config.map((c, n) => (n === i ? { ...c, ...patch } : c)) });
  return (
    <Card
      title="Configuration values"
      actions={
        <Button
          disabledReason={readOnlyReason}
          onClick={() =>
            set({ config: [...draft.config, { name: "", source: "literal", value: "" }] })
          }
        >
          Add value
        </Button>
      }
    >
      <p>
        Non-secret settings, delivered as environment variables and as files under{" "}
        <code>/etc/afs/config</code>. Use the namespace value to share one setting across the team's
        agents. Secrets belong under Secrets.
      </p>
      {draft.config.map((c, i) => {
        const ns = namespace.find((v) => v.name === c.name.trim());
        const key = `${i}`;
        return (
          <div
            key={key}
            style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}
          >
            <FormField label={`Name of value ${i + 1}`} error={errors[`config.${i}.name`]}>
              <TextInput value={c.name} onChange={(e) => change(i, { name: e.target.value })} />
            </FormField>
            <FormField
              label={`Source of ${c.name || `value ${i + 1}`}`}
              error={errors[`config.${i}.source`]}
            >
              <SelectInput
                value={c.source}
                options={[
                  {
                    value: "namespace",
                    label: ns ? "Use namespace value" : "Use namespace value (none by this name)",
                  },
                  { value: "literal", label: "Agent value" },
                ]}
                onChange={(e) => change(i, { source: e.target.value as ConfigRow["source"] })}
              />
            </FormField>
            {c.source === "literal" ? (
              <FormField
                label={`Value of ${c.name || `value ${i + 1}`}`}
                error={errors[`config.${i}.value`]}
              >
                <TextInput value={c.value} onChange={(e) => change(i, { value: e.target.value })} />
              </FormField>
            ) : (
              <div>
                <div>Effective value</div>
                <code>{ns?.value ?? "—"}</code> <span>from namespace</span>
              </div>
            )}
            <Button
              aria-label={`Remove value ${c.name || i + 1}`}
              onClick={() => set({ config: draft.config.filter((_, n) => n !== i) })}
            >
              Remove
            </Button>
          </div>
        );
      })}
    </Card>
  );
}
