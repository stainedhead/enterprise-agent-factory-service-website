// Pure reading of report rows (M3-R, CQ-16): the API's measure names are not typed in the OpenAPI, so
// the console reads the documented names and tolerates the older ones.
import { parse } from "../../../domain/money.js";
import type { ReportData, ReportKind, ReportRowRecord } from "../../ports/reports.js";

const COST_KEYS = ["estimatedUsd", "costUsd", "billedUsd"] as const;

/** A number measure, or undefined when absent or not numeric. */
export function num(row: ReportRowRecord, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/** A money measure as a string: `estimatedUsd`, else `costUsd`, else `billedUsd`. */
export function costOf(row: ReportRowRecord): string | undefined {
  for (const k of COST_KEYS) {
    const v = row[k];
    if (typeof v === "string" && v !== "") return v;
  }
  return undefined;
}

/** A money string as a plotted number (display only; arithmetic stays scaled bigint, WD-22). */
export const plotted = (money: string): number => Number(parse(money)) / 1_000_000;

const isCostKey = (k: string) => /usd|cost/i.test(k);

/** Whether a key holds money; such columns are never shown for traffic (WEB-US-37.3, D14). */
export const isMoneyKey = isCostKey;

/** Seconds as "3 h 10 min", "11 min" or "—" when absent or zero. */
export function duration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h} h ${String(m % 60).padStart(2, "0")} min`;
  return `${Math.max(1, m)} min`;
}

/** Bytes with a binary unit. */
export function bytes(n: number | undefined): string {
  if (n === undefined) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

/** The columns of a report: group-by keys first, then every other measure in first-seen order. */
export function columnsOf(data: ReportData, kind: ReportKind): string[] {
  const seen = new Set<string>(data.groupBy.map((g) => (g.startsWith("tag:") ? g : g)));
  const out = [...seen];
  for (const r of data.rows)
    for (const k of Object.keys(r)) {
      if (seen.has(k) || (kind === "traffic" && isCostKey(k))) continue;
      seen.add(k);
      out.push(k);
    }
  return out;
}

export interface ChartModel {
  readonly kind: "bar" | "stacked";
  readonly categories: readonly string[];
  readonly series: readonly { id: string; label: string; values: readonly (number | null)[] }[];
  readonly measure: "cost" | "calls";
}

/**
 * The chart of a report: a time series when grouped by day or hour (one series per other group key), else
 * one bar per group. Cost when the rows carry money, else calls; undefined when neither is present.
 */
export function chartOf(data: ReportData): ChartModel | undefined {
  const time = data.groupBy.find((g) => g === "day" || g === "hour");
  const other = data.groupBy.find((g) => g !== time);
  const value = (r: ReportRowRecord): number | undefined => {
    const c = costOf(r);
    return c !== undefined ? plotted(c) : num(r, "calls", "connections", "requests");
  };
  const measure: ChartModel["measure"] = data.rows.some((r) => costOf(r) !== undefined)
    ? "cost"
    : "calls";
  if (!data.rows.some((r) => value(r) !== undefined)) return undefined;
  const label = (v: unknown) => (v === undefined || v === null ? "(none)" : String(v));
  if (time) {
    const cats = [...new Set(data.rows.map((r) => label(r[time])))].sort();
    const names = [...new Set(data.rows.map((r) => (other ? label(r[other]) : "Total")))];
    return {
      kind: other ? "stacked" : "bar",
      measure,
      categories: cats,
      series: names.map((n) => ({
        id: n,
        label: n,
        values: cats.map((c) => {
          const m = data.rows.filter(
            (r) => label(r[time]) === c && (other ? label(r[other]) === n : true),
          );
          return m.length === 0 ? null : m.reduce((a, r) => a + (value(r) ?? 0), 0);
        }),
      })),
    };
  }
  const key = data.groupBy[0];
  return {
    kind: "bar",
    measure,
    categories: data.rows.map((r) => (key ? label(r[key]) : "Total")),
    series: [
      {
        id: "all",
        label: measure === "cost" ? "Cost" : "Calls",
        values: data.rows.map((r) => value(r) ?? null),
      },
    ],
  };
}

export interface ActivitySummary {
  readonly working: number;
  readonly idle: number;
  readonly paused: number;
  readonly other: number;
  /** Mean utilization as a percentage, or undefined when no row has one. */
  readonly utilizationPct: number | undefined;
  readonly longestIdleSeconds: number | undefined;
}

/** A utilization measure as a percentage: a fraction up to 1 is scaled, anything above is taken as is. */
export function utilizationPct(row: ReportRowRecord): number | undefined {
  const u = num(row, "utilization", "utilizationPct");
  if (u === undefined) return undefined;
  return Math.round(u <= 1 ? u * 100 : u);
}

/** The agent state of an activity row, lower-cased (`working`, `idle`, `paused`, ...). */
export const stateOf = (row: ReportRowRecord): string =>
  typeof row.state === "string" ? row.state.toLowerCase() : "";

/** Seconds a row has been idle: `idleSeconds`, else now minus `idleSince`. */
export function idleSeconds(row: ReportRowRecord, now: number): number | undefined {
  const s = num(row, "idleSeconds");
  if (s !== undefined) return s;
  const since = row.idleSince;
  if (typeof since === "string" && Date.parse(since) <= now)
    return Math.floor((now - Date.parse(since)) / 1000);
  return undefined;
}

export function summarizeActivity(rows: readonly ReportRowRecord[], now: number): ActivitySummary {
  let working = 0;
  let idle = 0;
  let paused = 0;
  let other = 0;
  for (const r of rows) {
    const s = stateOf(r);
    if (s === "working") working += 1;
    else if (s === "idle") idle += 1;
    else if (s === "paused") paused += 1;
    else other += 1;
  }
  const utils = rows.map(utilizationPct).filter((x): x is number => x !== undefined);
  const idles = rows.map((r) => idleSeconds(r, now)).filter((x): x is number => x !== undefined);
  return {
    working,
    idle,
    paused,
    other,
    utilizationPct: utils.length
      ? Math.round(utils.reduce((a, b) => a + b, 0) / utils.length)
      : undefined,
    longestIdleSeconds: idles.length ? Math.max(...idles) : undefined,
  };
}

/** The names of systems the rows mark `unmetered` (traffic is counted, never costed, and capped by nothing). */
export function unmeteredSystems(rows: readonly ReportRowRecord[]): string[] {
  return [
    ...new Set(
      rows
        .filter((r) => r.unmetered === true)
        .map((r) => String(r.system ?? r.systemId ?? r.host ?? "")),
    ),
  ].filter(Boolean);
}
