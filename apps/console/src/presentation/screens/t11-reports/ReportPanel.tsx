import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ReportKind, ReportScope } from "../../../application/ports/reports.js";
import {
  bytes,
  bytesOf,
  costOf,
  duration,
  num,
} from "../../../application/usecases/reports/reportView.js";
import { format } from "../../../domain/money.js";
import { Chart } from "../../components/charts/index.js";
import { Alert, Button, Card } from "../../components/index.js";
import {
  controlsFromParams,
  type FilterKey,
  ReportControls,
  type ReportControlsValue,
  toReportQuery,
  validateControls,
} from "../../components/report-controls/index.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { downloadText } from "../t15-history/download.js";
import { ReportTable } from "./ReportTable.js";

export interface ReportPanelProps {
  scope: ReportScope;
  kind: ReportKind;
  title: string;
  groupBy: readonly string[];
  defaultGroupBy: readonly string[];
  filters?: readonly FilterKey[];
  tagKeys?: readonly string[];
  /** Why *Download CSV* is disabled (a missing permission), or undefined. */
  csvDisabledReason?: string | undefined;
  /** Extra header actions, such as *Schedule report* (M4-S). */
  actions?: ReactNode;
  /** Called with the current controls so a sibling action can store them. */
  onControls?: (v: ReportControlsValue) => void;
  /** Where agent ids link to (team reports). */
  linkTeamId?: string | undefined;
}

const scopeKey = (s: ReportScope) =>
  s.level === "service" ? "service" : s.level === "team" ? s.teamId : `${s.teamId}/${s.agentId}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card title={label}>
      <div style={{ fontSize: 26, color: "var(--blue)" }}>{value}</div>
      {sub && <div>{sub}</div>}
    </Card>
  );
}

/**
 * One report with its controls, summary, chart and table (WEB-US-37, WEB-9): the API's notes are always shown,
 * traffic carries counts and bytes but never a cost, and *Download CSV* returns the API's body unchanged.
 */
export function ReportPanel(p: ReportPanelProps) {
  const reports = useService("reports");
  const [controls, setControls] = useState<ReportControlsValue>(() =>
    controlsFromParams(new URLSearchParams("range=mtd"), {
      range: "mtd",
      groupBy: p.defaultGroupBy,
      filters: {},
    }),
  );
  const invalid = Object.keys(validateControls(controls)).length > 0;
  const q = toReportQuery(controls);
  const run = useQuery({
    queryKey: queryKey({
      area: "reports",
      resource: p.kind,
      id: scopeKey(p.scope),
      params: { q },
    }),
    queryFn: ({ signal }) => reports.run(p.scope, p.kind, q, signal),
    enabled: !invalid,
  });
  const csv = useMutation({
    mutationFn: async () => {
      const f = await reports.csv(p.scope, p.kind, q);
      downloadText(f.filename, f.text);
    },
  });
  const v = run.data;
  const err = [run.error, csv.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const totals = v?.totals ?? {};
  const cost = costOf(totals);
  const tokens =
    (num(totals, "inputTokens") ?? 0) + (num(totals, "outputTokens") ?? 0) || undefined;
  const a = v?.activity;

  return (
    <div>
      <ReportControls
        value={controls}
        onChange={(c) => {
          setControls(c);
          p.onControls?.(c);
        }}
        groupBy={p.groupBy}
        tagKeys={p.tagKeys ?? []}
        filters={p.filters ?? []}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Button
          disabledReason={p.csvDisabledReason}
          disabled={csv.isPending || invalid}
          onClick={() => csv.mutate()}
        >
          Download CSV
        </Button>
        {p.actions}
      </div>
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The report could not be run" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {v?.notes.map((n) => (
        <Alert key={n} kind="info" title="Note">
          {n}
        </Alert>
      ))}
      {v && v.unmetered.length > 0 && (
        <Alert kind="warning" title="Unmetered systems">
          {v.unmetered.join(", ")} {v.unmetered.length === 1 ? "is" : "are"} unmetered: calls to{" "}
          {v.unmetered.length === 1 ? "it are" : "them are"} not counted in usage or cost reports
          and are not capped by any budget.
        </Alert>
      )}
      {v && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {cost !== undefined && p.kind !== "traffic" && (
            <Stat label="Spend" value={format(cost)} />
          )}
          {p.kind !== "activity" && num(totals, "calls") !== undefined && (
            <Stat label="Calls" value={String(num(totals, "calls"))} />
          )}
          {tokens !== undefined && <Stat label="Tokens" value={tokens.toLocaleString("en-GB")} />}
          {p.kind === "traffic" && num(totals, "connections") !== undefined && (
            <Stat label="Connections" value={String(num(totals, "connections"))} />
          )}
          {p.kind === "traffic" && bytesOf(totals) !== undefined && (
            <Stat label="Traffic" value={bytes(bytesOf(totals))} />
          )}
          {a && (
            <>
              <Stat
                label="Utilization"
                value={a.utilizationPct === undefined ? "—" : `${a.utilizationPct}%`}
                sub={`${a.working} working · ${a.idle} idle · ${a.paused} paused${a.other ? ` · ${a.other} other` : ""}`}
              />
              <Stat label="Longest idle" value={duration(a.longestIdleSeconds)} />
            </>
          )}
        </div>
      )}
      {v?.chart && (
        <Card title={p.title}>
          <Chart
            kind={v.chart.kind}
            title={p.title}
            unit={v.chart.measure === "cost" ? "USD" : "calls"}
            categories={v.chart.categories}
            series={v.chart.series}
            formatValue={(n) => (v.chart?.measure === "cost" ? format(n.toFixed(2)) : String(n))}
          />
        </Card>
      )}
      <Card title="Rows">
        <ReportTable
          id={`report-${p.kind}`}
          caption={`${p.title} rows`}
          columns={v?.columns ?? []}
          rows={v?.rows ?? []}
          teamId={p.linkTeamId}
          status={invalid ? "ready" : run.isPending ? "loading" : run.isError ? "error" : "ready"}
          error={err && !err.isAccessDenied ? err.message : undefined}
        />
      </Card>
    </div>
  );
}
