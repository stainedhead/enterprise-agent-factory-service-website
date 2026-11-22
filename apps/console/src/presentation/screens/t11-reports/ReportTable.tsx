import { Link } from "react-router";
import type { ReportRowRecord } from "../../../application/ports/reports.js";
import {
  bytes,
  duration,
  isMoneyKey,
  num,
  utilizationPct,
} from "../../../application/usecases/reports/reportView.js";
import { format, parse } from "../../../domain/money.js";
import { Badge, StatusIndicator, Table } from "../../components/index.js";

const HEADERS: Record<string, string> = {
  agent: "Agent",
  model: "Model",
  team: "Team",
  system: "External system",
  pool: "Pool",
  day: "Day",
  hour: "Hour",
  calls: "Calls",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  estimatedUsd: "Estimated cost",
  billedUsd: "Billed cost",
  costUsd: "Cost",
  utilization: "Utilization",
  idleSince: "Idle since",
  state: "Now",
  connections: "Connections",
  bytes: "Bytes",
  denied: "Denied",
  signIns: "Sign-ins",
  uniquePeople: "People",
  requests: "Requests",
  deniedRequests: "Denied requests",
  secretDetections: "Secret detections",
  surface: "Surface",
  reason: "Reason",
  person: "Person",
  serviceAdminEntry: "Service admin entry",
};

const SURFACE: Record<string, string> = {
  ui: "Paperclip UI",
  api: "Paperclip API",
  mcp: "MCP",
  cli: "CLI",
};
/** A column header: the known name, else the key split into words. */
export const headerOf = (k: string): string =>
  HEADERS[k] ??
  (k.startsWith("tag:")
    ? `Tag: ${k.slice(4)}`
    : k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()));

const STATE: Record<string, { word: string; dot: "green" | "grey" | "amber" | "red" }> = {
  working: { word: "Working", dot: "green" },
  idle: { word: "Idle", dot: "grey" },
  paused: { word: "Paused", dot: "grey" },
  unhealthy: { word: "Unhealthy", dot: "red" },
  budget_blocked: { word: "Budget blocked", dot: "amber" },
};

/** A person group: a principal `{id, type}` or a plain label; an API key is named as one. */
function personText(v: unknown): string {
  if (v && typeof v === "object") {
    const o = v as { id?: unknown; type?: unknown; label?: unknown };
    const name = String(o.label ?? o.id ?? "");
    return o.type === "api_key" ? `${name} (API key)` : name;
  }
  return String(v);
}

function cell(key: string, row: ReportRowRecord, teamId: string | undefined): React.ReactNode {
  const v = row[key];
  if (v === undefined || v === null || v === "") return "—";
  if (key === "state") {
    const s = STATE[String(v).toLowerCase()];
    return <StatusIndicator view={s ?? { word: String(v), dot: "grey" }} />;
  }
  if (key === "agent" && teamId)
    return <Link to={`/t/${teamId}/reports/agents/${String(v)}`}>{String(v)}</Link>;
  if (key === "serviceAdminEntry")
    return v === true ? <Badge tone="purple">Service admin entry</Badge> : "—";
  if (key === "surface") return SURFACE[String(v)] ?? String(v);
  if (key === "reason")
    return String(v)
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
  if (key === "person" || key === "principal") return personText(v);
  if (key === "unmetered") return v === true ? <Badge tone="purple">Unmetered</Badge> : "—";
  if (key.startsWith("utilization")) {
    const p = utilizationPct(row);
    return p === undefined ? "—" : `${p}%`;
  }
  if (isMoneyKey(key) && typeof v === "string") {
    try {
      parse(v);
      return format(v);
    } catch {
      return v;
    }
  }
  if (/^bytes|bytes(in|out)$/i.test(key)) return bytes(num(row, key));
  if (/seconds$/i.test(key)) return duration(num(row, key));
  if (key === "idleSince" && typeof v === "string") return v.replace("T", " ").slice(0, 16);
  if (typeof v === "number") return v.toLocaleString("en-GB");
  return String(v);
}

/** The rows of a report as a table, formatted by what each column holds (money, bytes, durations, states). */
export function ReportTable({
  id,
  caption,
  columns,
  rows,
  teamId,
  status,
  error,
}: {
  id: string;
  caption: string;
  columns: readonly string[];
  rows: readonly ReportRowRecord[];
  /** When set, agent ids link to the agent's report (T12). */
  teamId?: string | undefined;
  status: "loading" | "ready" | "error";
  error?: string | undefined;
}) {
  return (
    <Table
      id={id}
      caption={caption}
      filterLabel="Filter rows"
      status={status}
      error={error}
      emptyText="No rows for this range."
      columns={columns.map((k, i) => ({
        id: k,
        header: headerOf(k),
        alwaysVisible: i === 0,
        text: (r: ReportRowRecord) => String(r[k] ?? ""),
        sortValue: (r: ReportRowRecord) => {
          const n = num(r, k);
          return n ?? String(r[k] ?? "");
        },
        cell: (r: ReportRowRecord) => cell(k, r, teamId),
      }))}
      items={rows}
      getRowId={(r) => JSON.stringify(r)}
    />
  );
}
