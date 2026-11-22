import { Button, FormField, SelectInput, TextInput } from "../index.js";
import {
  type FilterKey,
  RANGES,
  type RangeChoice,
  type ReportControlsValue,
  validateControls,
} from "./query.js";

const FILTER_LABEL: Record<FilterKey, string> = {
  teamId: "Team",
  agentId: "Agent",
  modelId: "Model",
  systemId: "External system",
  poolId: "Pool",
};

const GROUP_LABEL: Record<string, string> = {
  team: "Team",
  agent: "Agent",
  model: "Model",
  system: "External system",
  pool: "Pool",
  day: "Day",
  hour: "Hour",
};

export interface ReportControlsProps {
  value: ReportControlsValue;
  onChange: (next: ReportControlsValue) => void;
  /** The group-by choices the report offers (without tag keys). */
  groupBy: readonly string[];
  /** Tag keys the report may be grouped by (`tag:<key>`). */
  tagKeys?: readonly string[];
  /** The filters to offer, each a free text id field. */
  filters?: readonly FilterKey[];
}

/**
 * Range, group by and filters for a report (WEB-US-37.1, WEB-9). Controlled; the screen owns the value and
 * turns it into the API query with `toReportQuery`. A bad custom range shows its message on the field.
 */
export function ReportControls({
  value,
  onChange,
  groupBy,
  tagKeys = [],
  filters = [],
}: ReportControlsProps) {
  const errors = validateControls(value);
  const set = (patch: Partial<ReportControlsValue>) => onChange({ ...value, ...patch });
  const options = [
    ...groupBy.map((g) => ({ value: g, label: GROUP_LABEL[g] ?? g })),
    ...tagKeys.map((k) => ({ value: `tag:${k}`, label: `Tag: ${k}` })),
  ];
  return (
    <form
      aria-label="Report controls"
      onSubmit={(e) => e.preventDefault()}
      style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 12 }}
    >
      <FormField label="Range">
        <SelectInput
          value={value.range}
          options={RANGES}
          onChange={(e) => set({ range: e.target.value as RangeChoice })}
        />
      </FormField>
      {value.range === "custom" && (
        <>
          <FormField label="From" error={errors.from}>
            <TextInput
              type="date"
              value={value.from ?? ""}
              onChange={(e) => set({ from: e.target.value })}
            />
          </FormField>
          <FormField label="To" error={errors.to}>
            <TextInput
              type="date"
              value={value.to ?? ""}
              onChange={(e) => set({ to: e.target.value })}
            />
          </FormField>
        </>
      )}
      {options.length > 0 && (
        <FormField label="Group by">
          <SelectInput
            value={value.groupBy[0] ?? ""}
            placeholder="No grouping"
            options={options}
            onChange={(e) => set({ groupBy: e.target.value ? [e.target.value] : [] })}
          />
        </FormField>
      )}
      {filters.map((k) => (
        <FormField key={k} label={FILTER_LABEL[k]}>
          <TextInput
            value={value.filters[k] ?? ""}
            onChange={(e) => set({ filters: { ...value.filters, [k]: e.target.value } })}
          />
        </FormField>
      ))}
      {(value.groupBy.length > 0 || Object.values(value.filters).some(Boolean)) && (
        <Button onClick={() => set({ groupBy: [], filters: {} })}>Clear filters</Button>
      )}
    </form>
  );
}
