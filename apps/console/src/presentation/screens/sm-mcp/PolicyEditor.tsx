// The policy rules editor of screens 47 (service policy) and the team server page (team policy).
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { CliCommand } from "../../../domain/cli.js";
import {
  ANNOTATION_WORDS,
  type AnnotationClass,
  emptyRule,
  type PolicyRuleDraft,
  ruleError,
  ruleWord,
  toRules,
} from "../../../domain/mcp.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  FormField,
  SelectInput,
  TextInput,
} from "../../components/index.js";
import { ErrorAlert } from "./shared.js";

const CLASSES = Object.keys(ANNOTATION_WORDS) as AnnotationClass[];

/**
 * Rules replace the stored ones (`PutMcpPolicy`, `PutTeamMcpPolicy`). The contract has no read of a policy, so the
 * editor starts from the rules saved here and the inventory's status column shows their effect (research note 4).
 */
export function PolicyEditor({
  title,
  intro,
  reason,
  save,
  cliFor,
  onSaved,
}: {
  title: string;
  intro: string;
  reason: string | undefined;
  save: (rules: readonly PolicyRuleDraft[]) => Promise<unknown>;
  cliFor: (rules: readonly PolicyRuleDraft[]) => CliCommand;
  onSaved?: () => void;
}) {
  const [rules, setRules] = useState<PolicyRuleDraft[]>([]);
  const [saved, setSaved] = useState<ReturnType<typeof toRules> | undefined>();
  const put = useMutation({
    mutationFn: () => save(rules),
    onSuccess: () => {
      setSaved(toRules(rules));
      onSaved?.();
    },
  });
  const err = isAppError(put.error) ? put.error : undefined;
  const set = (i: number, r: Partial<PolicyRuleDraft>) =>
    setRules(rules.map((x, n) => (n === i ? { ...x, ...r } : x)));
  const invalid = rules.some((r) => ruleError(r) !== undefined);
  return (
    <Card
      title={title}
      actions={
        <Button disabledReason={reason} onClick={() => setRules([...rules, emptyRule()])}>
          Add rule
        </Button>
      }
    >
      <p>{intro}</p>
      <ErrorAlert errors={[err]} title="The policy was not saved" />
      {saved && (
        <Alert kind="success" title="Policy saved">
          {saved.length === 0
            ? "No rules: every approved primitive is allowed."
            : saved.map((r) => ruleWord(r)).join("; ")}
        </Alert>
      )}
      {rules.length === 0 && <p>No rules in this edit. Saving with no rules clears the policy.</p>}
      {rules.map((r, i) => {
        const e = ruleError(r) ?? err?.fields[`rules.${i}`];
        return (
          <fieldset
            // biome-ignore lint/suspicious/noArrayIndexKey: rules are positional; the API takes them in order
            key={i}
            style={{ border: "1px solid var(--line)", borderRadius: 8, marginBottom: 8 }}
          >
            <legend>Rule {i + 1}</legend>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <FormField label="Effect">
                <SelectInput
                  value={r.effect}
                  options={[
                    { value: "block", label: "Block" },
                    { value: "allow", label: "Allow" },
                  ]}
                  onChange={(ev) =>
                    set(i, {
                      effect: ev.target.value as PolicyRuleDraft["effect"],
                      ...(ev.target.value === "block" && { rateLimitPerMinute: "" }),
                    })
                  }
                />
              </FormField>
              <FormField label="Match by">
                <SelectInput
                  value={r.by}
                  options={[
                    { value: "name", label: "Name or glob" },
                    { value: "class", label: "Annotation" },
                  ]}
                  onChange={(ev) => set(i, { by: ev.target.value as PolicyRuleDraft["by"] })}
                />
              </FormField>
              {r.by === "name" ? (
                <FormField label="Name" hint="For example delete_*">
                  <TextInput value={r.name} onChange={(ev) => set(i, { name: ev.target.value })} />
                </FormField>
              ) : (
                <FormField label="Annotation">
                  <SelectInput
                    value={r.class}
                    options={CLASSES.map((c) => ({ value: c, label: ANNOTATION_WORDS[c] }))}
                    onChange={(ev) => set(i, { class: ev.target.value as AnnotationClass })}
                  />
                </FormField>
              )}
              {r.effect === "allow" && (
                <FormField label="Calls per minute per agent (optional)">
                  <TextInput
                    inputMode="numeric"
                    value={r.rateLimitPerMinute}
                    onChange={(ev) => set(i, { rateLimitPerMinute: ev.target.value })}
                  />
                </FormField>
              )}
              <Button
                aria-label={`Remove rule ${i + 1}`}
                disabledReason={reason}
                onClick={() => setRules(rules.filter((_, n) => n !== i))}
              >
                Remove
              </Button>
            </div>
            {e && <p role="alert">{e}</p>}
          </fieldset>
        );
      })}
      <Button
        variant="primary"
        disabled={put.isPending}
        disabledReason={reason ?? (invalid ? "Fix the rules first" : undefined)}
        onClick={() => put.mutate()}
      >
        Save policy
      </Button>
      <CliPreview command={cliFor(rules)} />
    </Card>
  );
}
