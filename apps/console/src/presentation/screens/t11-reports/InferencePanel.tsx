import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import type {
  InferenceQuery,
  InferenceRowRecord,
  InferenceScope,
} from "../../../application/ports/modelEndpoints.js";
import {
  Alert,
  Button,
  Card,
  FormField,
  KeyValue,
  SelectInput,
  Table,
  type TableColumn,
  TextInput,
  Toolbar,
} from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { ErrorAlert, usd } from "../sg-model-endpoints/shared.js";
import { downloadText } from "../t15-history/download.js";

const RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "mtd", label: "Month to date" },
  { value: "90d", label: "Last 90 days" },
];
const GROUP_WORDS: Record<string, string> = {
  route: "Route",
  model: "Model",
  agent: "Agent",
  team: "Team",
  day: "Day",
  hour: "Hour",
};
const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US");
const ms = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${num(n)} ms`);
const key = (r: InferenceRowRecord, groupBy: readonly string[]) =>
  groupBy
    .map((g) => String((r as unknown as Record<string, unknown>)[groupKey(g)] ?? ""))
    .join("|");
const groupKey = (g: string) => (g === "agent" ? "agentId" : g === "team" ? "teamId" : g);

/** SG4 and TG4 (screens 59, 64; MEG-WEB-2, -3): calls, errors, tokens, cost and latency by route, model, agent or time. */
export function InferencePanel({ scope }: { scope: InferenceScope }) {
  const uc = useService("inferenceReports");
  const [params] = useSearchParams();
  const groups =
    scope.level === "service"
      ? ["route", "model", "team", "agent", "day", "hour"]
      : ["route", "model", "agent", "day", "hour"];
  const [q, setQ] = useState<{ range: string; groupBy: string; route: string }>({
    range: "7d",
    groupBy: "route",
    route: params.get("route") ?? "",
  });
  const query: InferenceQuery = {
    range: q.range,
    groupBy: [q.groupBy],
    ...(/^[a-z][a-z0-9-]{1,30}$/.test(q.route) ? { route: q.route } : {}),
  };
  const report = useQuery({
    queryKey: queryKey({
      area: "inference-report",
      teamId: scope.level === "team" ? scope.teamId : undefined,
      resource: "report",
      params: query as Record<string, unknown>,
    }),
    queryFn: ({ signal }) => uc.run(scope, query, signal),
  });
  const csv = useMutation({
    mutationFn: () => uc.csv(scope, query),
    onSuccess: (text) => downloadText(`inference-${q.groupBy}-${q.range}.csv`, text),
  });
  const data = report.data;
  const groupBy = data?.groupBy ?? [q.groupBy];
  const columns: TableColumn<InferenceRowRecord>[] = [
    ...groupBy.map((g) => ({
      id: g,
      header: GROUP_WORDS[g] ?? g,
      alwaysVisible: true,
      sortValue: (r: InferenceRowRecord) =>
        String((r as unknown as Record<string, unknown>)[groupKey(g)] ?? ""),
      cell: (r: InferenceRowRecord) => (
        <code>{String((r as unknown as Record<string, unknown>)[groupKey(g)] ?? "—")}</code>
      ),
    })),
    { id: "calls", header: "Calls", sortValue: (r) => r.calls, cell: (r) => num(r.calls) },
    {
      id: "errors",
      header: "Error rate",
      sortValue: (r) => r.errorRatePct ?? 0,
      cell: (r) => (r.errorRatePct === undefined ? num(r.errors) : `${r.errorRatePct}%`),
    },
    { id: "in", header: "Input tokens", cell: (r) => num(r.inputTokens) },
    { id: "out", header: "Output tokens", cell: (r) => num(r.outputTokens) },
    {
      id: "cost",
      header: "Cost",
      sortValue: (r) => Number(r.costUsd),
      cell: (r) => usd(r.costUsd),
    },
    {
      id: "eff",
      header: "Effective $/MTok",
      cell: (r) => r.effectiveUsdPerMtok ?? "—",
    },
    { id: "p50", header: "Latency p50", cell: (r) => ms(r.latencyP50Ms) },
    { id: "p95", header: "Latency p95", cell: (r) => ms(r.latencyP95Ms) },
    { id: "ttft", header: "Time to first token p95", cell: (r) => ms(r.ttftP95Ms) },
    {
      id: "tps",
      header: "Output tokens/s",
      defaultHidden: true,
      cell: (r) => num(r.outputTokensPerSecond),
    },
    { id: "gw", header: "Gateway p99", defaultHidden: true, cell: (r) => ms(r.gatewayP99Ms) },
    {
      id: "est",
      header: "Estimated",
      defaultHidden: true,
      cell: (r) => (r.estimatedPct === undefined ? "—" : `${r.estimatedPct}%`),
    },
  ];
  return (
    <Card title="Inference">
      <p>
        Every call through the team gateway, by route. Per-token routes are priced at the approved
        price; capacity and free routes are metered and reported only.
      </p>
      <Toolbar>
        <FormField label="Range">
          <SelectInput
            value={q.range}
            options={RANGES}
            onChange={(e) => setQ({ ...q, range: e.target.value })}
          />
        </FormField>
        <FormField label="Group by">
          <SelectInput
            value={q.groupBy}
            options={groups.map((g) => ({ value: g, label: GROUP_WORDS[g] ?? g }))}
            onChange={(e) => setQ({ ...q, groupBy: e.target.value })}
          />
        </FormField>
        <FormField label="Route">
          <TextInput
            value={q.route}
            placeholder="All routes"
            onChange={(e) => setQ({ ...q, route: e.target.value.trim() })}
          />
        </FormField>
        <Button disabled={csv.isPending} onClick={() => csv.mutate()}>
          Download CSV
        </Button>
      </Toolbar>
      <ErrorAlert errors={[report.error, csv.error]} />
      {data?.notes.map((n) => (
        <Alert key={n} kind="info" title="Note">
          {n}
        </Alert>
      ))}
      {data && (
        <KeyValue
          items={[
            { label: "Calls", value: num(data.totals.calls) },
            { label: "Errors", value: num(data.totals.errors) },
            { label: "Cost", value: usd(data.totals.costUsd) },
            { label: "Latency p95", value: ms(data.totals.latencyP95Ms) },
            {
              label: "Range",
              value: `${data.range.from.slice(0, 10)} to ${data.range.to.slice(0, 10)}`,
            },
          ]}
        />
      )}
      <Table
        id={`inference-${scope.level}`}
        caption="Inference"
        status={report.isPending ? "loading" : report.isError ? "error" : "ready"}
        emptyText="No calls in this range."
        columns={columns}
        items={data?.rows ?? []}
        getRowId={(r) => key(r, groupBy)}
      />
    </Card>
  );
}
