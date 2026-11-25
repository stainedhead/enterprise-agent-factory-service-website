import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import { can } from "../../../domain/me.js";
import { format } from "../../../domain/money.js";
import { formatLocal } from "../../../domain/time.js";
import { Chart } from "../../components/charts/index.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  KeyValue,
  PageHeader,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { teamKey, useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { areaKey, queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { downloadText } from "../t15-history/download.js";
import { EditBudgetDialog } from "./EditBudgetDialog.js";
import { SpendBySource } from "./SpendBySource.js";

const ON_EXHAUST: Record<string, { title: string; text: string }> = {
  block: {
    title: "Block calls",
    text: "The gateway rejects calls; an IAM deny is applied as a backstop.",
  },
  notify: {
    title: "Notify only",
    text: "Calls continue and the team is notified (service admins set this).",
  },
};

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(iso),
  );
const tokens = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n >= 1e9
      ? `${(n / 1e9).toFixed(1)} B`
      : n >= 1e6
        ? `${Math.round(n / 1e6)} M`
        : String(n);

/** T5 (WEB-US-28): budget, forecast, daily spend, spend by agent and the budget settings. */
export function BudgetPage() {
  const { teamId = "" } = useParams();
  const budgets = useService("budgets");
  const teams = useService("teams");
  const agents = useOptionalService("agents");
  const me = useMe();
  const qc = useQueryClient();
  const writeGate = useTeamWriteGate(teamId);
  const [editing, setEditing] = useState(false);

  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const key = queryKey({ area: "budgets", teamId, resource: "overview" });
  const ov = useQuery({ queryKey: key, queryFn: ({ signal }) => budgets.overview(teamId, signal) });
  const names = useQuery({
    queryKey: queryKey({ area: "agents", teamId, resource: "names" }),
    queryFn: async ({ signal }) =>
      new Map(
        (await (agents?.list(teamId, signal) ?? Promise.resolve([]))).map((a) => [a.id, a.name]),
      ),
    enabled: agents !== undefined,
  });
  const csv = useMutation({
    mutationFn: async () => {
      const f = await budgets.usageCsv(teamId);
      downloadText(f.filename, f.text);
    },
  });

  const t = team.data;
  const o = ov.data;
  const err = [ov.error, csv.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const mayChooseAction =
    me.serviceAdmin && t?.kind === "persistent" && can(me, "teams:set-guardrails");
  const b = o?.budget;

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: t?.slug ?? "Team", to: `/t/${teamId}` },
          { label: "Budget & usage" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Budget & usage"
        description="Spend is reserved per model call by the gateway and stopped at the hard cap. CUR reconciles billed cost daily."
        infoHref="/docs/budget"
        actions={
          <>
            <Button
              disabledReason={gate(me, "usage:read", teamId)}
              disabled={csv.isPending}
              onClick={() => csv.mutate()}
            >
              Download CSV
            </Button>
            <Button
              variant="primary"
              disabledReason={writeGate.reasonFor("budgets:write")}
              onClick={() => setEditing(true)}
            >
              Edit budget
            </Button>
          </>
        }
      />
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="Budget data could not be loaded" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {!o || !b ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <Card title="Month to date">
              <div style={{ fontSize: 28, color: "var(--blue)" }}>{format(b.spentUsd)}</div>
              <progress
                value={Math.min(100, o.percentUsed)}
                max={100}
                aria-label="Budget used"
                style={{ width: "100%" }}
              />
              <div>
                {o.percentUsed}% of {format(b.amountUsd)}
                {t && <> · ceiling {format(t.effectiveCeilingUsd)}</>}
              </div>
            </Card>
            <Card title="Forecast, month end">
              <div style={{ fontSize: 28, color: "var(--blue)" }}>
                {b.forecastUsd ? format(b.forecastUsd) : "—"}
              </div>
              {b.projectedCapAt ? (
                <div style={{ color: "var(--amber)" }}>
                  Projected to hit cap on {formatLocal(b.projectedCapAt).split(",")[0]}
                </div>
              ) : (
                <div>No cap date projected</div>
              )}
            </Card>
            <Card title="On exhaust">
              <strong>{(ON_EXHAUST[b.onExhaust] ?? { title: b.onExhaust }).title}</strong>
              <div>{ON_EXHAUST[b.onExhaust]?.text}</div>
            </Card>
            <Card
              title={
                o.reconciliation ? `Reconciled (${dayLabel(o.reconciliation.day)})` : "Reconciled"
              }
            >
              {o.reconciliation ? (
                <>
                  <div style={{ fontSize: 20 }}>
                    Variance {o.reconciliation.variancePct > 0 ? "+" : ""}
                    {o.reconciliation.variancePct}%
                  </div>
                  <div>
                    Gateway {format(o.reconciliation.gatewayUsd)} · billed{" "}
                    {format(o.reconciliation.billedUsd)}
                  </div>
                </>
              ) : (
                <div>Not reconciled yet: billed cost arrives daily.</div>
              )}
            </Card>
          </div>
          <Card title="Daily spend">
            <Chart
              kind="stacked"
              title="Daily spend"
              unit="USD"
              categories={o.days.map(dayLabel)}
              series={[
                { id: "bedrock", label: "Bedrock tokens (gateway, real time)", values: o.bedrock },
                { id: "eks", label: "EKS compute (CUR, daily)", values: o.eks },
              ]}
              formatValue={(n) => format(n.toFixed(2))}
            />
          </Card>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            <Card title="By agent">
              <Table
                id="budget-by-agent"
                caption="Spend by agent this month"
                emptyText="No spend yet this month."
                columns={[
                  {
                    id: "agent",
                    header: "Agent",
                    alwaysVisible: true,
                    sortValue: (a) => names.data?.get(a.agentId) ?? a.agentId,
                    cell: (a) => names.data?.get(a.agentId) ?? a.agentId,
                  },
                  { id: "in", header: "Input tok", cell: (a) => tokens(a.inputTokens) },
                  { id: "out", header: "Output tok", cell: (a) => tokens(a.outputTokens) },
                  {
                    id: "cost",
                    header: "Cost",
                    sortValue: (a) => Number(a.costUsd),
                    cell: (a) => format(a.costUsd),
                  },
                ]}
                items={o.agents}
                getRowId={(a) => a.agentId}
              />
            </Card>
            <SpendBySource teamId={teamId} />
            <Card title="Budget settings">
              <KeyValue
                items={[
                  {
                    label: "Period",
                    value: b.period === "monthly" ? "Monthly, resets on the 1st (UTC)" : b.period,
                  },
                  { label: "Amount", value: format(b.amountUsd) },
                  {
                    label: "Alert thresholds",
                    value: b.thresholds.map((x) => `${x}%`).join(" · ") || "None",
                  },
                  {
                    label: "Alerts go to",
                    value: can(me, "notifications:read", teamId) ? (
                      <Link to={`/t/${teamId}/delivery/notifications`}>Notification channels</Link>
                    ) : (
                      "The team's notification channels"
                    ),
                  },
                  ...(me.serviceAdmin
                    ? [
                        {
                          label: "Guardrails",
                          value: (
                            <Link to={`/teams/${teamId}/admin`}>Ceiling, override and quotas</Link>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </Card>
          </div>
        </>
      )}
      {editing && t && b && (
        <EditBudgetDialog
          team={t}
          budget={b}
          mayChooseAction={mayChooseAction === true}
          onClose={() => setEditing(false)}
          onSaved={() => void qc.invalidateQueries({ queryKey: areaKey("budgets", teamId) })}
        />
      )}
    </div>
  );
}
