import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  agentTotals,
  reconcilerHealth,
  spendSummary,
  teamCounts,
  topSpenders,
} from "../../../application/usecases/dashboard/DashboardUseCases.js";
import { can } from "../../../domain/me.js";
import { format } from "../../../domain/money.js";
import {
  Alert,
  Card,
  PageHeader,
  StatusIndicator,
  Table,
  WidgetBoundary,
} from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

const key = (resource: string, params?: Record<string, unknown>) =>
  queryKey({ area: "dashboard", resource, params });

/** S1 (WEB-US-12): counts, spend against budgets, reconciler health, top spenders, teams needing attention. */
export function DashboardPage() {
  const me = useMe();
  const dash = useService("dashboard");
  const canTeams = can(me, "teams:read-directory");
  const canReports = can(me, "admin:reports");
  const canPricing = can(me, "admin:pricing");

  const teams = useQuery({
    queryKey: key("teams"),
    queryFn: ({ signal }) => dash.allTeams(signal),
    enabled: canTeams,
  });
  const spend = useQuery({
    queryKey: key("spend"),
    queryFn: ({ signal }) => dash.spend(signal),
    enabled: canReports,
  });
  const ids = (teams.data ?? []).map((t) => t.id).join(",");
  const scan = useQuery({
    queryKey: key("agents", { teams: ids }),
    queryFn: ({ signal }) => dash.scanAgents(teams.data ?? [], signal),
    enabled: canTeams && teams.data !== undefined,
  });
  const ready = useQuery({
    queryKey: key("readiness"),
    queryFn: ({ signal }) => dash.readiness(signal),
    refetchInterval: 30_000,
  });
  const variance = useQuery({
    queryKey: key("variance"),
    queryFn: ({ signal }) => dash.varianceDays(signal),
    enabled: canReports,
  });
  const proposals = useQuery({
    queryKey: key("proposals"),
    queryFn: ({ signal }) => dash.pendingProposals(signal),
    enabled: canPricing,
  });

  const t = teams.data;
  const counts = t && teamCounts(t);
  const money = t && spend.data ? spendSummary(t, spend.data) : undefined;
  const top = t && spend.data ? topSpenders(t, spend.data) : undefined;
  const attention = t && spend.data ? dash.attention(t, spend.data, scan.data) : undefined;
  const agents = scan.data ? agentTotals(scan.data) : undefined;
  const more = (c: { more: boolean; count: number }) => `${c.count}${c.more ? "+" : ""}`;

  return (
    <div>
      <PageHeader title="Service dashboard" infoHref="/docs/dashboard" />
      {variance.data && variance.data.count > 0 && (
        <Alert kind="warning" title="Cost variance over the threshold">
          {more(variance.data)} team-day
          {variance.data.count === 1 && !variance.data.more ? "" : "s"} are over the variance
          threshold. <Link to="/reports/reconciliation">Review reconciliation</Link>
        </Alert>
      )}
      {proposals.data && proposals.data.count > 0 && (
        <Alert kind="warning" title="Price proposals pending">
          {more(proposals.data)} model price proposal
          {proposals.data.count === 1 && !proposals.data.more ? " is" : "s are"} waiting for a
          decision. <Link to="/models">Review prices</Link>
        </Alert>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        <Card title="Teams">
          <WidgetBoundary title="Teams" error={teams.error} onRetry={() => void teams.refetch()}>
            {counts ? (
              <p>
                <strong style={{ fontSize: 28 }}>{counts.total}</strong>
                <br />
                {counts.active} active, {counts.suspended} suspended, {counts.ephemeral} ephemeral
              </p>
            ) : (
              <p>Loading…</p>
            )}
          </WidgetBoundary>
        </Card>
        <Card title="Agents">
          <WidgetBoundary title="Agents" error={scan.error} onRetry={() => void scan.refetch()}>
            {agents && scan.data ? (
              <p>
                <strong style={{ fontSize: 28 }}>{agents.total}</strong>
                <br />
                {agents.degraded} degraded
                {scan.data.skippedTeams > 0 && (
                  <>
                    <br />
                    <small>
                      Counts cover the first 50 teams; {scan.data.skippedTeams} not read.
                    </small>
                  </>
                )}
              </p>
            ) : (
              <p>Loading…</p>
            )}
          </WidgetBoundary>
        </Card>
        <Card title="Spend this month">
          <WidgetBoundary
            title="Spend"
            error={spend.error ?? teams.error}
            onRetry={() => {
              void spend.refetch();
              void teams.refetch();
            }}
          >
            {money ? (
              <div>
                <p>
                  <strong style={{ fontSize: 28 }}>{format(money.spentUsd)}</strong>
                  <br />
                  of {format(money.budgetUsd)} in budgets ({Math.round(money.percent)}%)
                </p>
                <progress
                  aria-label="Spend against budgets"
                  value={Math.min(money.percent, 100)}
                  max={100}
                  style={{ width: "100%" }}
                />
              </div>
            ) : (
              <p>{canReports ? "Loading…" : "You cannot view spend."}</p>
            )}
          </WidgetBoundary>
        </Card>
        <Card title="Reconciler health">
          <WidgetBoundary
            title="Reconciler health"
            error={ready.error}
            onRetry={() => void ready.refetch()}
          >
            {ready.data ? (
              (() => {
                const h = reconcilerHealth(ready.data);
                return (
                  <div>
                    <p>
                      <StatusIndicator view={{ word: h.word, dot: h.dot }} />
                    </p>
                    <small>{h.checks.map((c) => `${c.name}: ${c.result}`).join(", ")}</small>
                  </div>
                );
              })()
            ) : (
              <p>Loading…</p>
            )}
          </WidgetBoundary>
        </Card>
      </div>
      <Card title="Top spenders this month">
        <WidgetBoundary
          title="Top spenders"
          error={spend.error ?? teams.error}
          onRetry={() => {
            void spend.refetch();
            void teams.refetch();
          }}
        >
          {top ? (
            top.length === 0 ? (
              <p>No spend yet this month.</p>
            ) : (
              <ol>
                {top.map((s) => (
                  <li key={s.teamId}>
                    <Link to={`/t/${s.teamId}`}>{s.displayName}</Link> · {format(s.costUsd)}
                  </li>
                ))}
              </ol>
            )
          ) : (
            <p>Loading…</p>
          )}
        </WidgetBoundary>
      </Card>
      <Card title="Teams needing attention">
        <WidgetBoundary
          title="Teams needing attention"
          error={teams.error ?? spend.error}
          onRetry={() => {
            void teams.refetch();
            void spend.refetch();
          }}
        >
          {attention ? (
            <Table
              id="teams-attention"
              caption="Teams needing attention"
              filterLabel="Filter teams needing attention"
              emptyText="No team needs attention."
              columns={[
                {
                  id: "team",
                  header: "Team",
                  alwaysVisible: true,
                  sortValue: (a) => a.slug,
                  cell: (a) => <Link to={`/t/${a.teamId}`}>{a.displayName}</Link>,
                  text: (a) => `${a.slug} ${a.displayName}`,
                },
                {
                  id: "reasons",
                  header: "Why",
                  alwaysVisible: true,
                  cell: (a) => (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {a.reasons.map((r) => (
                        <li key={r.kind}>{r.text}</li>
                      ))}
                    </ul>
                  ),
                  text: (a) => a.reasons.map((r) => r.text).join(" "),
                },
              ]}
              items={attention}
              getRowId={(a) => a.teamId}
            />
          ) : (
            <p>Loading…</p>
          )}
        </WidgetBoundary>
      </Card>
    </div>
  );
}
