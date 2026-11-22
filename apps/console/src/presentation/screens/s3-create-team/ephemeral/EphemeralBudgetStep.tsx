import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_EPHEMERAL_MAX_DAYS,
  type EphemeralDraft,
  estimate,
  type TeardownRule,
} from "../../../../application/usecases/teams/ephemeral.js";
import { format } from "../../../../domain/money.js";
import { FormField, SelectInput, TextInput } from "../../../components/index.js";
import { queryKey } from "../../../query/keys.js";
import { useOptionalService } from "../../../services.js";

/** `teams.ephemeral_max_days` from the service settings; the contract default when settings are unreadable. */
export function useEphemeralMaxDays(): number {
  const settings = useOptionalService("settings");
  const q = useQuery({
    queryKey: queryKey({ area: "settings", resource: "list" }),
    queryFn: ({ signal }) =>
      settings ? settings.list(signal) : Promise.reject(new Error("no settings")),
    enabled: settings !== undefined,
    retry: false,
  });
  const v = q.data?.find((s) => s.key === "teams.ephemeral_max_days")?.value;
  return typeof v === "number" && v > 0 ? v : DEFAULT_EPHEMERAL_MAX_DAYS;
}

const RULES: { value: TeardownRule; label: string; hint: string }[] = [
  {
    value: "at_cap_or_expiry",
    label: "At expiry or cap, whichever first",
    hint: "Agents scaled to zero, IAM revoked, namespace deleted. Config and audit kept.",
  },
  {
    value: "at_expiry",
    label: "At expiry only",
    hint: "At the cap, agents pause and wait for a budget increase.",
  },
];

/** The ephemeral budget step: hard cap, lifetime, teardown rule and the estimate (WEB-US-38.1, 38.2). */
export function EphemeralBudgetStep({
  budget,
  thresholds,
  draft,
  maxDays,
  errors,
  now,
  onBudget,
  onThresholds,
  onChange,
}: {
  budget: string;
  thresholds: string;
  draft: EphemeralDraft;
  maxDays: number;
  errors: Readonly<Record<string, string>>;
  now: Date;
  onBudget: (v: string) => void;
  onThresholds: (v: string) => void;
  onChange: (d: EphemeralDraft) => void;
}) {
  const est = estimate(budget, draft, now);
  return (
    <div>
      <FormField
        label="Lifetime budget (USD)"
        hint="Never resets. Calls stop at the cap."
        error={budget !== "" ? errors.maxBudgetUsd : undefined}
      >
        <TextInput inputMode="decimal" value={budget} onChange={(e) => onBudget(e.target.value)} />
      </FormField>
      <FormField
        label="Expires"
        hint={`The team is torn down at expiry (00:00 UTC), at most ${maxDays} days from now`}
        error={draft.expiresOn !== "" ? errors.expiresOn : undefined}
      >
        <TextInput
          type="date"
          value={draft.expiresOn}
          onChange={(e) => onChange({ ...draft, expiresOn: e.target.value })}
        />
      </FormField>
      <FormField label="When the cap is reached" hint="Calls are blocked and the team is notified">
        <SelectInput
          value={draft.teardownRule}
          onChange={(e) => onChange({ ...draft, teardownRule: e.target.value as TeardownRule })}
          options={RULES.map((r) => ({ value: r.value, label: r.label }))}
        />
      </FormField>
      <p style={{ color: "var(--muted)" }}>
        {RULES.find((r) => r.value === draft.teardownRule)?.hint}
      </p>
      <FormField
        label="Alert thresholds (%)"
        hint="Comma separated, for example 50, 80, 100"
        error={errors.thresholds}
      >
        <TextInput value={thresholds} onChange={(e) => onThresholds(e.target.value)} />
      </FormField>
      <FormField
        label="Expected daily cost (USD)"
        hint="Optional. Blank spreads the budget evenly over the lifetime"
        error={errors.dailyCostUsd}
      >
        <TextInput
          inputMode="decimal"
          value={draft.dailyCostUsd}
          onChange={(e) => onChange({ ...draft, dailyCostUsd: e.target.value })}
        />
      </FormField>
      <section aria-label="Estimate">
        <h3>Estimate</h3>
        {est ? (
          <p>
            About {format(est.dailyUsd)} per day. The cap would be reached in {est.capDays} days (
            {est.capDate}
            {est.afterExpiry ? ", after expiry" : ""}).
          </p>
        ) : (
          <p>Enter the budget and the expiry to see an estimate.</p>
        )}
      </section>
    </div>
  );
}

/** The review rows of an ephemeral team. */
export function ephemeralReview(d: EphemeralDraft): { label: string; value: string }[] {
  return [
    { label: "Expires", value: d.expiresOn || "—" },
    {
      label: "Teardown",
      value: RULES.find((r) => r.value === d.teardownRule)?.label ?? d.teardownRule,
    },
  ];
}
