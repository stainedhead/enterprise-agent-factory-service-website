import { useCallback } from "react";
import { useSearchParams } from "react-router";
import type { AuditFilter } from "../../../application/ports/history.js";
import { Button, FormField, SelectInput, TextInput } from "../../components/index.js";

const KEYS = ["from", "to", "actorId", "action", "outcome", "resourceKind", "resourceId"] as const;

/** The audit filter as URL query parameters (shareable and reload-safe); shared with S5. */
export function useAuditFilterParams(): [AuditFilter, (next: AuditFilter) => void] {
  const [params, setParams] = useSearchParams();
  const filter: AuditFilter = Object.fromEntries(
    KEYS.flatMap((k) => {
      const v = params.get(k);
      return v ? [[k, v]] : [];
    }),
  );
  const set = useCallback(
    (next: AuditFilter) => {
      const p = new URLSearchParams(params);
      for (const k of KEYS) {
        const v = next[k];
        if (v) p.set(k, v);
        else p.delete(k);
      }
      setParams(p, { replace: true });
    },
    [params, setParams],
  );
  return [filter, set];
}

const dayOf = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "");

/** The S5 filters: period, actor, action, outcome and resource. Controlled; the caller owns the state. */
export function AuditFilters({
  value,
  onChange,
  error,
}: {
  value: AuditFilter;
  onChange: (next: AuditFilter) => void;
  /** A message for the period, such as an end before the start. */
  error?: string | undefined;
}) {
  const set = (k: keyof AuditFilter, v: string) =>
    onChange({ ...value, [k]: v === "" ? undefined : v });
  return (
    <form
      aria-label="Audit filters"
      onSubmit={(e) => e.preventDefault()}
      style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 12 }}
    >
      <FormField label="From">
        <TextInput
          type="date"
          value={dayOf(value.from)}
          onChange={(e) => set("from", e.target.value && `${e.target.value}T00:00:00Z`)}
        />
      </FormField>
      <FormField label="To" error={error}>
        <TextInput
          type="date"
          value={dayOf(value.to)}
          onChange={(e) => set("to", e.target.value && `${e.target.value}T23:59:59Z`)}
        />
      </FormField>
      <FormField label="Actor">
        <TextInput value={value.actorId ?? ""} onChange={(e) => set("actorId", e.target.value)} />
      </FormField>
      <FormField label="Action">
        <TextInput value={value.action ?? ""} onChange={(e) => set("action", e.target.value)} />
      </FormField>
      <FormField label="Outcome">
        <SelectInput
          value={value.outcome ?? ""}
          placeholder="All outcomes"
          options={[
            { value: "allowed", label: "Allowed" },
            { value: "denied", label: "Denied" },
            { value: "failed", label: "Failed" },
          ]}
          onChange={(e) => set("outcome", e.target.value)}
        />
      </FormField>
      <FormField label="Resource kind">
        <TextInput
          value={value.resourceKind ?? ""}
          onChange={(e) => set("resourceKind", e.target.value)}
        />
      </FormField>
      <FormField label="Resource id">
        <TextInput
          value={value.resourceId ?? ""}
          onChange={(e) => set("resourceId", e.target.value)}
        />
      </FormField>
      <Button onClick={() => onChange({})}>Clear filters</Button>
    </form>
  );
}
