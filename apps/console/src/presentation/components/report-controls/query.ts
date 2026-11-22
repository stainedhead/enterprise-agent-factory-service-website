// The report controls' value and its mapping to the contract's report query (M3-C2). Pure, so the
// screens and the tests share it. Dates are `YYYY-MM-DD`; a custom range is sent as `from`/`to` instants.

export const RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "mtd", label: "Month to date" },
  { value: "custom", label: "Custom range" },
] as const;

export type RangeChoice = (typeof RANGES)[number]["value"];

/** Filters the API takes (contract §4.9); tag filters are not in the OpenAPI (CQ-16). */
export type FilterKey = "teamId" | "agentId" | "modelId" | "systemId" | "poolId";

export interface ReportControlsValue {
  readonly range: RangeChoice;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /** `team`, `agent`, `model`, `system`, `pool`, `day`, `hour` or `tag:<key>`. */
  readonly groupBy: readonly string[];
  readonly filters: Readonly<Partial<Record<FilterKey, string>>>;
}

/** What the API's report operations take. */
export interface ReportQueryParams {
  readonly range?: string;
  readonly from?: string;
  readonly to?: string;
  readonly groupBy?: readonly string[];
  readonly teamId?: string;
  readonly agentId?: string;
  readonly modelId?: string;
  readonly systemId?: string;
  readonly poolId?: string;
}

export const DEFAULT_CONTROLS: ReportControlsValue = { range: "30d", groupBy: [], filters: {} };

/** A message per field when the value cannot be sent (a custom range without dates or backwards). */
export function validateControls(v: ReportControlsValue): Partial<Record<"from" | "to", string>> {
  if (v.range !== "custom") return {};
  const out: Partial<Record<"from" | "to", string>> = {};
  if (!v.from) out.from = "Choose a start date";
  if (!v.to) out.to = "Choose an end date";
  if (v.from && v.to && v.from > v.to) out.to = "The end must not be before the start";
  return out;
}

/** The contract's query for `v`; blank filters and an invalid custom range are left out. */
export function toReportQuery(v: ReportControlsValue): ReportQueryParams {
  const q: { -readonly [K in keyof ReportQueryParams]: ReportQueryParams[K] } = {};
  if (v.range === "custom") {
    if (v.from) q.from = `${v.from}T00:00:00Z`;
    if (v.to) q.to = `${v.to}T23:59:59Z`;
  } else q.range = v.range;
  if (v.groupBy.length > 0) q.groupBy = [...v.groupBy];
  for (const [k, val] of Object.entries(v.filters)) if (val) q[k as FilterKey] = val;
  return q;
}

const FILTER_KEYS: readonly FilterKey[] = ["teamId", "agentId", "modelId", "systemId", "poolId"];

/** The value as URL search parameters (shareable and reload-safe). */
export function controlsToParams(v: ReportControlsValue): URLSearchParams {
  const p = new URLSearchParams();
  p.set("range", v.range);
  if (v.range === "custom") {
    if (v.from) p.set("from", v.from);
    if (v.to) p.set("to", v.to);
  }
  if (v.groupBy.length > 0) p.set("groupBy", v.groupBy.join(","));
  for (const k of FILTER_KEYS) {
    const val = v.filters[k];
    if (val) p.set(k, val);
  }
  return p;
}

/** Reads a value back from URL parameters, falling back to `base` for anything missing or unknown. */
export function controlsFromParams(
  p: URLSearchParams,
  base: ReportControlsValue = DEFAULT_CONTROLS,
): ReportControlsValue {
  const r = p.get("range");
  const range = RANGES.find((x) => x.value === r)?.value ?? base.range;
  const gb = p.get("groupBy");
  const filters: Partial<Record<FilterKey, string>> = {};
  for (const k of FILTER_KEYS) {
    const v = p.get(k);
    if (v) filters[k] = v;
  }
  return {
    range,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    groupBy: gb ? gb.split(",").filter(Boolean) : base.groupBy,
    filters: Object.keys(filters).length > 0 ? filters : base.filters,
  };
}
