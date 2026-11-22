import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { isAppError } from "../../../../../application/errors.js";
import { duration } from "../../../../../application/usecases/reports/reportView.js";
import { format } from "../../../../../domain/money.js";
import { Alert, Card, KeyValue } from "../../../../components/index.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import type { PanelTabProps } from "../../panelTabs.js";

/** *Usage* (T12 summary on T2): the agent's month-to-date cost, calls, tokens, utilization and longest idle. */
export function UsageTab({ teamId, agent }: PanelTabProps) {
  const reports = useService("reports");
  const q = useQuery({
    queryKey: queryKey({ area: "reports", teamId, resource: "agent-summary", id: agent.id }),
    queryFn: ({ signal }) => reports.agentSummary(teamId, agent.id, { range: "mtd" }, signal),
  });
  const err = isAppError(q.error) ? q.error : undefined;
  const s = q.data;
  return (
    <Card title="Usage this month">
      {err && (
        <Alert kind="error" title="Usage could not be loaded" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {q.isPending && <p role="status">Loading usage…</p>}
      {s && (
        <KeyValue
          items={[
            { label: "Spend", value: s.costUsd ? format(s.costUsd) : "—" },
            { label: "Calls", value: s.calls?.toLocaleString("en-GB") ?? "—" },
            {
              label: "Tokens",
              value:
                s.inputTokens === undefined && s.outputTokens === undefined
                  ? "—"
                  : `${(s.inputTokens ?? 0).toLocaleString("en-GB")} in · ${(s.outputTokens ?? 0).toLocaleString("en-GB")} out`,
            },
            {
              label: "Utilization",
              value:
                s.activity?.utilizationPct === undefined ? "—" : `${s.activity.utilizationPct}%`,
            },
            { label: "Longest idle", value: duration(s.activity?.longestIdleSeconds) },
          ]}
        />
      )}
      <p>
        <Link to={`/t/${teamId}/reports/agents/${agent.id}`}>Open the full report</Link>
      </p>
    </Card>
  );
}
