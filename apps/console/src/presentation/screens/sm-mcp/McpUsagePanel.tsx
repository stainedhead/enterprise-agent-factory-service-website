import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { McpScopeRef, McpUsageRowRecord } from "../../../application/ports/mcp.js";
import { McpUsageUseCases } from "../../../application/usecases/mcp/McpUseCases.js";
import {
  lastUsedWord,
  mcpReasonWord,
  ms,
  pct,
  SERVICE_USAGE_VIEWS,
  startQueryCaptureCli,
  TEAM_USAGE_VIEWS,
} from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  FormField,
  Modal,
  SelectInput,
  Table,
  type TableColumn,
  TextInput,
  Toolbar,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { downloadText } from "../t15-history/download.js";
import { captureKey, ErrorAlert, num, usageKey } from "./shared.js";

const GROUPS: Record<string, string> = {
  server: "Server",
  primitive: "Tool, resource or prompt",
  team: "Team",
  agent: "Agent",
  day: "Day",
};

/**
 * SM5 and TM5 (screens 55, 53; MCP-WEB-1, -3): every MCP request through the gateways by server, primitive, team,
 * agent or day; enabled-but-unused access; refusals by reason; discovery quality; catalog adoption. No arguments,
 * results or query text are shown: the ledger does not hold them.
 */
export function McpUsagePanel({ scope }: { scope: McpScopeRef }) {
  const uc = useService("mcpUsage");
  const [params, setParams] = useSearchParams();
  const views = scope.level === "service" ? SERVICE_USAGE_VIEWS : TEAM_USAGE_VIEWS;
  const view = views.some((v) => v.id === params.get("view"))
    ? (params.get("view") as string)
    : "usage";
  const groups = Object.keys(GROUPS).filter((g) => scope.level === "service" || g !== "team");
  const groupBy = groups.includes(params.get("groupBy") ?? "")
    ? (params.get("groupBy") as string)
    : "server";
  const [windowDays, setWindowDays] = useState(30);
  const q = { view, groupBy, ...(view === "unused" ? { windowDays } : {}) };
  const key = scope.level === "team" ? `team:${scope.teamId}` : "service";
  const report = useQuery({
    queryKey: usageKey(key, q),
    queryFn: ({ signal }) => uc.run(scope, q, signal),
  });
  const csv = useMutation({
    mutationFn: () => uc.csv(scope, q),
    onSuccess: (text) => downloadText(`mcp-${view}-${groupBy}.csv`, text),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };
  const rows = report.data?.rows ?? [];
  const totals = McpUsageUseCases.totals(rows);
  return (
    <>
      <Toolbar>
        <FormField label="View">
          <SelectInput
            value={view}
            options={views.map((v) => ({ value: v.id, label: v.label }))}
            onChange={(e) => set("view", e.target.value)}
          />
        </FormField>
        <FormField label="Group by">
          <SelectInput
            value={groupBy}
            options={groups.map((g) => ({ value: g, label: GROUPS[g] ?? g }))}
            onChange={(e) => set("groupBy", e.target.value)}
          />
        </FormField>
        {view === "unused" && (
          <FormField label="Not called in">
            <SelectInput
              value={String(windowDays)}
              options={[
                { value: "30", label: "30 days" },
                { value: "90", label: "90 days" },
              ]}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            />
          </FormField>
        )}
        <Button disabled={csv.isPending} onClick={() => csv.mutate()}>
          Download CSV
        </Button>
      </Toolbar>
      <ErrorAlert errors={[report.error, csv.error]} />
      {report.data && (
        <p>
          {formatLocal(report.data.from)} to {formatLocal(report.data.to)}. No arguments, results or
          query text are stored.
        </p>
      )}
      {view === "usage" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          <Card title="Calls">
            <p style={{ fontSize: 28, margin: 0 }}>{num(totals.calls)}</p>
          </Card>
          <Card title="Tool errors">
            <p style={{ fontSize: 28, margin: 0 }}>{pct(totals.errors, totals.calls)}</p>
            <p>isError results from servers</p>
          </Card>
          <Card title="Refused by AFS">
            <p style={{ fontSize: 28, margin: 0 }}>{num(totals.refusals)}</p>
          </Card>
          <Card title="p95 latency">
            <p style={{ fontSize: 28, margin: 0 }}>{ms(totals.p95Ms)}</p>
          </Card>
        </div>
      )}
      {(view === "usage" || view === "adoption") && rows.length > 0 && (
        <Bars
          title={view === "adoption" ? "Catalog adoption (teams that switched on)" : "Most used"}
          rows={McpUsageUseCases.top(rows)}
          value={(r) => (view === "adoption" ? (r.teams ?? 0) : r.calls)}
        />
      )}
      {view === "unused" && (
        <Alert kind="info" title="Narrow access to what agents use">
          Switch a server off on the team's MCP servers page, or select fewer servers on an agent's
          MCP tab.
        </Alert>
      )}
      <Card title={views.find((v) => v.id === view)?.label ?? "Usage"}>
        <Table
          id={`mcp-usage-${scope.level}-${view}`}
          caption={`MCP ${view} by ${GROUPS[groupBy]?.toLowerCase() ?? groupBy}`}
          filterLabel="Filter rows"
          status={report.isPending ? "loading" : report.isError ? "error" : "ready"}
          emptyText="No MCP requests in this range."
          items={rows}
          getRowId={(r) => r.key}
          columns={columnsFor(view, groupBy)}
        />
      </Card>
      {scope.level === "service" && view === "discovery" && <QueryCapture />}
    </>
  );
}

function columnsFor(view: string, groupBy: string): TableColumn<McpUsageRowRecord>[] {
  const label: TableColumn<McpUsageRowRecord> = {
    id: "label",
    header: view === "refusals" && groupBy === "server" ? "Reason" : (GROUPS[groupBy] ?? groupBy),
    alwaysVisible: true,
    sortValue: (r) => r.label,
    cell: (r) =>
      view === "refusals" && groupBy === "server" ? mcpReasonWord(r.label) : <code>{r.label}</code>,
  };
  const n = (id: string, header: string, v: (r: McpUsageRowRecord) => number | null | undefined) =>
    ({
      id,
      header,
      sortValue: (r: McpUsageRowRecord) => v(r) ?? -1,
      cell: (r: McpUsageRowRecord) => num(v(r)),
    }) satisfies TableColumn<McpUsageRowRecord>;
  const now = Date.now();
  switch (view) {
    case "unused":
      return [
        label,
        n("agents", "Agents with access", (r) => r.agents),
        {
          id: "last",
          header: "Last used",
          sortValue: (r) => r.lastUsedAt ?? "",
          cell: (r) => lastUsedWord(r.lastUsedAt, now),
        },
      ];
    case "refusals":
      return [
        label,
        n("refusals", "Count", (r) => r.refusals),
        n("calls", "Calls", (r) => r.calls),
      ];
    case "discovery":
      return [
        label,
        n("searches", "Searches", (r) => r.searches),
        {
          id: "hit",
          header: "Search → call",
          sortValue: (r) => r.searchHitRate ?? -1,
          cell: (r) =>
            r.searchHitRate === null || r.searchHitRate === undefined
              ? "—"
              : `${(r.searchHitRate * 100).toFixed(1)}%`,
        },
        n("calls", "Calls", (r) => r.calls),
      ];
    case "adoption":
      return [
        label,
        n("teams", "Teams", (r) => r.teams),
        n("agents", "Agents", (r) => r.agents),
        n("calls", "Calls", (r) => r.calls),
      ];
    default:
      return [
        label,
        n("calls", "Calls", (r) => r.calls),
        {
          id: "errors",
          header: "Tool errors",
          sortValue: (r) => (r.calls ? r.errors / r.calls : 0),
          cell: (r) => pct(r.errors, r.calls),
        },
        n("refusals", "Refused", (r) => r.refusals),
        {
          id: "p95",
          header: "p95",
          sortValue: (r) => r.p95Ms ?? -1,
          cell: (r) => ms(r.p95Ms),
        },
      ];
  }
}

/** A labelled bar per row; the number is always printed beside the bar (never colour alone). */
function Bars({
  title,
  rows,
  value,
}: {
  title: string;
  rows: readonly McpUsageRowRecord[];
  value: (r: McpUsageRowRecord) => number;
}) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <Card title={title}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((r) => (
          <li
            key={r.key}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(120px, 2fr) 3fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <code>{r.label}</code>
            <progress max={max} value={value(r)} aria-label={`${r.label}: ${num(value(r))}`} />
            <span>{num(value(r))}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A time-boxed, audited query capture for search tuning (AC-9.4); off by default. */
function QueryCapture() {
  const uc = useService("mcpReviews");
  const me = useMe();
  const qc = useQueryClient();
  const write = gate(me, "mcp-settings:write");
  const [open, setOpen] = useState(false);
  const capture = useQuery({
    queryKey: captureKey,
    queryFn: ({ signal }) => uc.queryCapture(signal),
    enabled: can(me, "mcp-events:read"),
  });
  const stop = useMutation({
    mutationFn: () => uc.stopCapture(),
    onSettled: () => void qc.invalidateQueries({ queryKey: captureKey }),
  });
  const c = capture.data;
  const active = c && c.stoppedAt === null;
  return (
    <Card title="Query capture">
      <ErrorAlert errors={[capture.error, stop.error]} />
      <p>
        Query text is not stored; no-result searches are only counted. A capture stores search text
        for a few days to tune discovery, and is audited.
      </p>
      {active ? (
        <>
          <Alert kind="warning" title="Capture running">
            Until {formatLocal(c.until)}, started by {c.startedBy}: {c.reason}
          </Alert>
          <Button disabledReason={write} disabled={stop.isPending} onClick={() => stop.mutate()}>
            Stop capture
          </Button>
        </>
      ) : (
        <Button variant="primary" disabledReason={write} onClick={() => setOpen(true)}>
          Start a query capture
        </Button>
      )}
      {open && <StartCaptureDialog onClose={() => setOpen(false)} />}
      <p>
        <Link to="/settings/mcp">MCP settings</Link>
      </p>
    </Card>
  );
}

function StartCaptureDialog({ onClose }: { onClose: () => void }) {
  const uc = useService("mcpReviews");
  const qc = useQueryClient();
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const start = useMutation({
    mutationFn: () => uc.startCapture(Number(days), reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: captureKey });
      onClose();
    },
  });
  const err = isAppError(start.error) ? start.error : undefined;
  return (
    <Modal
      title="Start a query capture"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={start.isPending} onClick={() => start.mutate()}>
            Start capture
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && <ErrorAlert errors={[err]} />}
      <FormField label="Days" hint="At most mcp.query_capture_max_days" error={err?.fields.days}>
        <TextInput inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      </FormField>
      <FormField label="Reason" error={err?.fields.reason}>
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
      <CliPreview command={startQueryCaptureCli(Number(days) || 0, reason || "<reason>")} />
    </Modal>
  );
}
