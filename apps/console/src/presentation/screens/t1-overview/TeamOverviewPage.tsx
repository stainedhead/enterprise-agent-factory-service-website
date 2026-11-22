import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import { label } from "../../../domain/labels.js";
import { can } from "../../../domain/me.js";
import { format } from "../../../domain/money.js";
import { phaseView } from "../../../domain/status.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  ActionsMenu,
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  GenerationNote,
  KeyValue,
  PageHeader,
  StatusIndicator,
  Table,
  Tabs,
  WidgetBoundary,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { teamKey, useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { teamView } from "../s2-teams/TeamsPage.js";
import { cards } from "./cards.js";
import { EditTeamDialog } from "./EditTeamDialog.js";
import { ModelsTab } from "./ModelsTab.js";

/** T1, and V1 for viewers: the team overview with its *Overview* and *Models* tabs (WEB-US-24, WEB-US-36). */
export function TeamOverviewPage({ viewer = false }: { viewer?: boolean }) {
  const { teamId = "" } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const teams = useService("teams");
  const qc = useQueryClient();
  const gateW = useTeamWriteGate(teamId);
  const [dialog, setDialog] = useState<"suspend" | "resume" | "edit" | undefined>();
  const [error, setError] = useState<unknown>();

  const team = usePolledQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
    phasesOf: (t) => [t.state === "deleting" ? "Reconciling" : t.status.phase],
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: queryKey({ area: "teams", teamId, resource: "team" }) });
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setError(undefined);
      setDialog(undefined);
      void refresh();
    },
    onError: (e) => {
      setDialog(undefined);
      setError(e);
    },
  });

  if (team.isError) {
    if (isAppError(team.error) && team.error.kind === "not-found") return <NotFoundPage team />;
    return (
      <Alert
        kind="error"
        title="The team could not be loaded"
        requestId={isAppError(team.error) ? team.error.requestId : undefined}
      >
        {team.error instanceof Error ? team.error.message : "Try again."}
      </Alert>
    );
  }
  const t = team.data;
  if (!t) return <p role="status">Loading…</p>;

  const canWrite = can(me, "teams:write", teamId);
  const canSuspend = can(me, "teams:suspend", teamId);
  const tab = new URLSearchParams(search).get("tab") === "models" ? "models" : "overview";
  const suspendedRace =
    isAppError(error) && error.kind === "conflict" && error.reason === "team_suspended";

  const header = (
    <PageHeader
      title={t.displayName}
      description={t.description ?? `Team ${t.slug}`}
      infoHref="/docs/team-overview"
      actions={
        <>
          <Button
            disabledReason={gate(me, "teams:write", teamId) ?? gateW.reasonFor("teams:write")}
            onClick={() => setDialog("edit")}
          >
            Edit
          </Button>
          {canSuspend ? (
            <ActionsMenu
              actions={[
                {
                  id: "suspend",
                  label: "Suspend",
                  onSelect: () => setDialog("suspend"),
                  disabledReason:
                    t.state === "active"
                      ? undefined
                      : t.state === "suspended"
                        ? "Team is already suspended"
                        : "Team is not active",
                },
                {
                  id: "resume",
                  label: "Resume",
                  onSelect: () => setDialog("resume"),
                  disabledReason: t.state === "suspended" ? undefined : "Team is not suspended",
                },
              ]}
            />
          ) : (
            <Button disabledReason={gate(me, "teams:suspend", teamId)}>Actions ▾</Button>
          )}
          <Button
            variant="primary"
            disabledReason={gateW.reasonFor("agents:write")}
            onClick={() => navigate(`/t/${teamId}/agents/new`)}
          >
            Create agent
          </Button>
        </>
      }
    />
  );

  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: t.slug }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      {viewer && (
        <Alert kind="info" title="Read-only access">
          You can view this team. Controls that change it are disabled and name the role they need.
        </Alert>
      )}
      {suspendedRace && (
        <Alert
          kind="warning"
          title="Team is suspended"
          requestId={isAppError(error) ? error.requestId : undefined}
        >
          The change was not applied because the team was suspended.
        </Alert>
      )}
      {isAppError(error) && !suspendedRace && !error.isAccessDenied && (
        <Alert
          kind="error"
          title="The change was not applied"
          requestId={error.requestId}
          onDismiss={() => setError(undefined)}
        >
          {error.message}
        </Alert>
      )}
      {header}
      <Tabs
        label="Team"
        activeId={tab}
        onChange={(id) => navigate(id === "models" ? `/t/${teamId}?tab=models` : `/t/${teamId}`)}
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: <OverviewTab teamId={teamId} />,
          },
          {
            id: "models",
            label: "Models",
            content: <ModelsTab teamId={teamId} version={t.version} />,
          },
        ]}
      />
      {dialog === "suspend" && (
        <ConfirmDialog
          title={`Suspend ${t.slug}`}
          confirmLabel="Suspend"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => act.mutate(() => teams.suspend(teamId))}
        >
          Agents stop and changes are blocked until the team is resumed.
        </ConfirmDialog>
      )}
      {dialog === "resume" && (
        <ConfirmDialog
          title={`Resume ${t.slug}`}
          confirmLabel="Resume"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => act.mutate(() => teams.resume(teamId))}
        >
          The team becomes active again.
        </ConfirmDialog>
      )}
      {dialog === "edit" && canWrite && (
        <EditTeamDialog
          team={t}
          onClose={() => setDialog(undefined)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  );
}

function OverviewTab({ teamId }: { teamId: string }) {
  const me = useMe();
  const teams = useService("teams");
  const overview = useService("overview");
  const t = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const budget = useQuery({
    queryKey: queryKey({ area: "overview", teamId, resource: "budget" }),
    queryFn: ({ signal }) => overview.budgetBurn(teamId, signal),
    enabled: can(me, "budgets:read", teamId),
  });
  const health = useQuery({
    queryKey: queryKey({ area: "overview", teamId, resource: "agent-health" }),
    queryFn: ({ signal }) => overview.agentHealth(teamId, signal),
    enabled: can(me, "agents:read", teamId),
  });
  const activity = useQuery({
    queryKey: queryKey({ area: "overview", teamId, resource: "activity" }),
    queryFn: ({ signal }) => overview.recentActivity(teamId, 5, signal),
    enabled: can(me, "audit:read", teamId),
  });
  const workOrders = useQuery({
    queryKey: queryKey({ area: "overview", teamId, resource: "work-orders" }),
    queryFn: ({ signal }) => overview.teamWorkOrders(teamId, signal),
    enabled: can(me, "work-orders:read", teamId),
  });
  const team = t.data;
  if (!team) return null;
  const arn = health.data?.sharedRoleArn;

  return (
    <div>
      <Card title="Team">
        <KeyValue
          items={[
            { label: "Namespace", value: team.namespace },
            {
              label: "Cluster",
              value: <span title="The API does not report the cluster yet">—</span>,
            },
            {
              label: "IAM role",
              value: arn ? (
                <span>
                  <code>{arn}</code> <CopyButton text={arn} label="Copy IAM role ARN" />
                </span>
              ) : (
                <span title="Shown once an agent uses the team's shared role">—</span>
              ),
            },
            { label: "Cost center", value: team.costCenter ?? "—" },
            { label: "State", value: <StatusIndicator view={teamView(team)} /> },
            {
              label: "Reconcile",
              value: (
                <GenerationNote
                  generation={team.generation}
                  observed={team.status.observedGeneration}
                />
              ),
            },
            { label: "Kind", value: label("teamKind", team.kind) },
          ]}
        />
      </Card>
      <Card title="Conditions">
        <Table
          id="team-conditions"
          caption="Team conditions"
          filterLabel="Filter conditions"
          columns={[
            {
              id: "type",
              header: "Type",
              alwaysVisible: true,
              sortValue: (c) => c.type,
              cell: (c) => c.type,
            },
            { id: "status", header: "Status", sortValue: (c) => c.status, cell: (c) => c.status },
            { id: "reason", header: "Reason", cell: (c) => c.reason ?? "—" },
            { id: "message", header: "Message", cell: (c) => c.message ?? "—" },
            {
              id: "time",
              header: "Since",
              sortValue: (c) => c.lastTransitionTime,
              cell: (c) => (
                <time dateTime={c.lastTransitionTime} title={utcTitle(c.lastTransitionTime)}>
                  {formatLocal(c.lastTransitionTime)}
                </time>
              ),
            },
          ]}
          items={team.status.conditions}
          getRowId={(c) => c.type}
          emptyText={`Phase ${phaseView(team.status.phase).word}: no conditions reported.`}
        />
      </Card>
      <Card title="Budget">
        <WidgetBoundary title="Budget" error={budget.error} onRetry={() => void budget.refetch()}>
          {budget.data ? (
            <div>
              <progress
                aria-label="Budget used"
                value={Math.min(budget.data.percent, 100)}
                max={100}
                style={{ width: "100%" }}
              />
              <p>
                {format(budget.data.budget.spentUsd)} of {format(budget.data.budget.amountUsd)} (
                {Math.round(budget.data.percent)}%)
                {budget.data.crossed.length > 0 && (
                  <> · crossed {budget.data.crossed.join("%, ")}%</>
                )}
              </p>
              <Link to={`/t/${teamId}/budget`}>Open budget and usage</Link>
            </div>
          ) : (
            <p>{can(me, "budgets:read", teamId) ? "Loading…" : "You cannot view the budget."}</p>
          )}
        </WidgetBoundary>
      </Card>
      <Card title="Agent health">
        <WidgetBoundary
          title="Agent health"
          error={health.error}
          onRetry={() => void health.refetch()}
        >
          {health.data ? (
            health.data.total === 0 ? (
              <p>No agents yet.</p>
            ) : (
              <ul style={{ display: "flex", gap: 24, listStyle: "none", padding: 0 }}>
                {health.data.counts.map((c) => (
                  <li key={c.word}>
                    <StatusIndicator view={{ word: c.word, dot: c.dot }} />{" "}
                    <strong>{c.count}</strong>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p>Loading…</p>
          )}
        </WidgetBoundary>
      </Card>
      {can(me, "audit:read", teamId) && (
        <Card title="Recent activity">
          <WidgetBoundary
            title="Recent activity"
            error={activity.error}
            onRetry={() => void activity.refetch()}
          >
            {activity.data && activity.data.length > 0 ? (
              <ul>
                {activity.data.map((e) => (
                  <li key={e.id}>
                    <time dateTime={e.occurredAt} title={utcTitle(e.occurredAt)}>
                      {formatLocal(e.occurredAt)}
                    </time>{" "}
                    · {e.action} · {e.actorId} · {e.outcome}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{activity.data ? "No activity yet." : "Loading…"}</p>
            )}
            <Link to={`/t/${teamId}/history/audit`}>View all activity</Link>
          </WidgetBoundary>
        </Card>
      )}
      {can(me, "work-orders:read", teamId) && (
        <Card title="Work orders">
          <WidgetBoundary
            title="Work orders"
            error={workOrders.error}
            onRetry={() => void workOrders.refetch()}
          >
            {workOrders.data && workOrders.data.length > 0 ? (
              <Table
                id="team-work-orders"
                caption="Work orders"
                filterLabel="Filter work orders"
                columns={[
                  {
                    id: "title",
                    header: "Title",
                    alwaysVisible: true,
                    sortValue: (w) => w.title,
                    cell: (w) => <Link to={`/work-orders/${w.id}`}>{w.title}</Link>,
                  },
                  {
                    id: "severity",
                    header: "Severity",
                    sortValue: (w) => w.severity,
                    cell: (w) => w.severity,
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (w) => label("workOrderStatus", w.status),
                  },
                  { id: "sla", header: "SLA", cell: (w) => label("slaState", w.slaState) },
                  { id: "due", header: "Due", cell: (w) => formatLocal(w.slaDueAt) },
                ]}
                items={workOrders.data}
                getRowId={(w) => w.id}
              />
            ) : (
              <p>{workOrders.data ? "No work orders for this team." : "Loading…"}</p>
            )}
          </WidgetBoundary>
        </Card>
      )}
      {cards
        .filter((c) => c.visibleWhen(me, teamId))
        .map((c) => (
          <WidgetBoundary key={c.id} title={c.id}>
            {c.render({ teamId })}
          </WidgetBoundary>
        ))}
    </div>
  );
}
