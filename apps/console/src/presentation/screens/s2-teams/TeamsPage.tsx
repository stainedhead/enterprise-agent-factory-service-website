import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { TeamRecord } from "../../../application/ports/teams.js";
import { overrideActive, type TeamRow } from "../../../application/usecases/teams/TeamsUseCases.js";
import { label } from "../../../domain/labels.js";
import { format, percent } from "../../../domain/money.js";
import { type PhaseView, statusView, teamStateView } from "../../../domain/status.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  ActionsMenu,
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  PageHeader,
  SelectInput,
  StatusIndicator,
  Table,
  type TableColumn,
  Toolbar,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey, queryKey } from "../../query/keys.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { TeamActionDialogs, type TeamDialog } from "./TeamActionDialogs.js";

const PAGE_SIZES = [10, 25, 50] as const;

/** A suspended, deleting or deleted team shows its state; otherwise the status phase (§4.2). */
export function teamView(t: TeamRecord): PhaseView {
  return t.state === "active" ? statusView(t.status) : teamStateView(t.state);
}

/** The phase the poller watches: a team being deleted keeps refreshing until it is gone. */
const watched = (t: TeamRecord): string =>
  t.state === "deleting" ? "Reconciling" : t.status.phase;

/** S2: all teams for service admins (WEB-US-13). */
export function TeamsPage() {
  const me = useMe();
  const teams = useService("teams");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") ?? "";
  const state = params.get("state") ?? "";
  const budgets = params.get("view") === "budgets";
  const [tokens, setTokens] = useState<(string | undefined)[]>([undefined]);
  const [index, setIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<TeamDialog | undefined>();
  const [error, setError] = useState<unknown>();

  const token = tokens[index];
  const list = usePolledQuery({
    queryKey: queryKey({
      area: "teams",
      resource: "list",
      params: { kind, state, token, pageSize },
    }),
    queryFn: ({ signal }) =>
      teams.listRows({
        maxResults: pageSize,
        ...(kind && { kind }),
        ...(state && { state }),
        ...(token !== undefined && { nextToken: token }),
        signal,
      }),
    phasesOf: (d) => d.rows.map((r) => watched(r.team)),
  });

  const rows = list.data?.rows ?? [];
  const nextToken = list.data?.nextToken;
  const team = rows.find((r) => r.team.id === selected[0])?.team;
  const refresh = () => qc.invalidateQueries({ queryKey: areaKey("teams") });

  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setError(undefined);
      setDialog(undefined);
      void refresh();
    },
    onError: (e) => {
      // a form dialog keeps its input and shows the error beside it; a confirmation closes
      const k = dialogRef.current?.kind;
      if (k === "ceiling" || k === "raise") return;
      setDialog(undefined);
      setError(e);
    },
  });

  const filter = (name: "kind" | "state", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setTokens([undefined]);
    setIndex(0);
    setSelected([]);
  };

  const suspendable = team?.state === "active";
  const resumable = team?.state === "suspended";
  const open = (d: TeamDialog["kind"]) => {
    if (!team) return;
    act.reset();
    setDialog({ kind: d, team });
  };
  const need = (p: Parameters<typeof gate>[1], extra?: string) =>
    gate(me, p) ?? (team ? extra : "Select a team first");

  const columns: TableColumn<TeamRow>[] = [
    {
      id: "slug",
      header: "Name",
      alwaysVisible: true,
      sortValue: (r) => r.team.slug,
      cell: (r) => <Link to={`/t/${r.team.id}`}>{r.team.slug}</Link>,
    },
    {
      id: "kind",
      header: "Kind",
      sortValue: (r) => r.team.kind,
      cell: (r) => (
        <Badge tone={r.team.kind === "ephemeral" ? "purple" : "blue"}>
          {label("teamKind", r.team.kind)}
        </Badge>
      ),
    },
    {
      id: "state",
      header: "State",
      sortValue: (r) => teamView(r.team).word,
      cell: (r) => <StatusIndicator view={teamView(r.team)} />,
    },
    {
      id: "agents",
      header: "Agents",
      cell: () => <span title="The API does not report agent counts yet">—</span>,
    },
    ...(budgets
      ? ([
          {
            id: "budget",
            header: "Budget",
            sortValue: (r) => Number(r.team.maxBudgetUsd),
            cell: (r) => format(r.team.maxBudgetUsd),
          },
          {
            id: "ceiling",
            header: "Effective ceiling",
            cell: (r) => format(r.team.effectiveCeilingUsd),
          },
          {
            id: "override",
            header: "Temporary ceiling",
            cell: (r) => <Override team={r.team} />,
          },
          { id: "spend", header: "Spend (MTD)", cell: (r) => <Spend row={r} /> },
        ] satisfies TableColumn<TeamRow>[])
      : ([
          {
            id: "spend",
            header: "Spend / budget (MTD)",
            cell: (r) => <Spend row={r} withBudget />,
          },
        ] satisfies TableColumn<TeamRow>[])),
    {
      id: "cost",
      header: "Cost center",
      sortValue: (r) => r.team.costCenter ?? "",
      cell: (r) => r.team.costCenter ?? "—",
    },
    {
      id: "expires",
      header: "Expires",
      cell: (r) =>
        r.team.kind === "ephemeral" && r.team.expiresAt ? (
          <time dateTime={r.team.expiresAt} title={utcTitle(r.team.expiresAt)}>
            {formatLocal(r.team.expiresAt)}
          </time>
        ) : (
          "—"
        ),
    },
    {
      id: "links",
      header: "Records",
      cell: (r) =>
        r.team.state === "deleted" ? (
          <span>
            <Link to={`/t/${r.team.id}/budget`}>Usage</Link> ·{" "}
            <Link to={`/t/${r.team.id}/reports`}>Cost</Link> ·{" "}
            <Link to={`/t/${r.team.id}/history/audit`}>History</Link>
          </span>
        ) : null,
    },
  ];

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: budgets ? "Budgets & ceilings" : "Teams" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title={budgets ? "Budgets & ceilings" : "Teams"}
        description="Each team is an isolated namespace with its own IAM role, inference profiles, secrets and budget."
        infoHref="/docs/teams"
        actions={
          <>
            <Button onClick={() => void refresh()}>Refresh</Button>
            <ActionsMenu
              actions={[
                {
                  id: "suspend",
                  label: "Suspend",
                  onSelect: () => open("suspend"),
                  disabledReason: need(
                    "teams:suspend",
                    suspendable ? undefined : "Only an active team can be suspended",
                  ),
                },
                {
                  id: "resume",
                  label: "Resume",
                  onSelect: () => open("resume"),
                  disabledReason: need(
                    "teams:suspend",
                    resumable ? undefined : "Only a suspended team can be resumed",
                  ),
                },
                {
                  id: "ceiling",
                  label: "Set ceiling",
                  onSelect: () => open("ceiling"),
                  disabledReason: need("teams:set-guardrails"),
                },
                {
                  id: "raise",
                  label: "Raise ceiling temporarily",
                  onSelect: () => open("raise"),
                  disabledReason: need("teams:set-guardrails"),
                },
                {
                  id: "delete",
                  label: "Delete",
                  onSelect: () => open("delete"),
                  disabledReason: need(
                    "teams:delete",
                    team && team.state === "deleted" ? "Already deleted" : undefined,
                  ),
                },
              ]}
            />
            <Button
              variant="primary"
              disabledReason={gate(me, "teams:create")}
              onClick={() => navigate("/teams/new")}
            >
              Create team
            </Button>
          </>
        }
      />
      {isAppError(error) && !error.isAccessDenied && (
        <Alert
          kind="error"
          title="The change was not applied"
          requestId={error.requestId}
          onDismiss={() => setError(undefined)}
        >
          {error.message}
        </Alert>
      )}
      <Toolbar>
        <SelectInput
          aria-label="Kind"
          value={kind}
          onChange={(e) => filter("kind", e.target.value)}
          placeholder="Any kind"
          options={[
            { value: "persistent", label: "Persistent" },
            { value: "ephemeral", label: "Ephemeral" },
          ]}
        />
        <SelectInput
          aria-label="State"
          value={state}
          onChange={(e) => filter("state", e.target.value)}
          placeholder="Any state"
          options={["active", "suspended", "deleting", "deleted"].map((v) => ({
            value: v,
            label: teamStateView(v).word,
          }))}
        />
      </Toolbar>
      <Table
        id="teams"
        caption="Teams"
        filterLabel="Find teams by name or cost center"
        columns={columns}
        items={rows}
        getRowId={(r) => r.team.id}
        status={list.isError ? "error" : list.isPending ? "loading" : "ready"}
        error={
          list.isError && isAppError(list.error) ? (
            <Alert kind="error" requestId={list.error.requestId}>
              {list.error.message}
            </Alert>
          ) : undefined
        }
        emptyText="No teams match."
        selection={{ mode: "single", selected, onChange: setSelected }}
        pagination={{
          pageSize,
          pageSizes: PAGE_SIZES,
          hasNext: nextToken !== undefined,
          hasPrev: index > 0,
          onNext: () => {
            if (nextToken === undefined) return;
            setTokens((t) => [...t.slice(0, index + 1), nextToken]);
            setIndex(index + 1);
          },
          onPrev: () => setIndex((i) => Math.max(0, i - 1)),
          onPageSizeChange: (n) => {
            setPageSize(n);
            setTokens([undefined]);
            setIndex(0);
          },
        }}
      />
      <TeamActionDialogs
        dialog={dialog}
        onClose={() => setDialog(undefined)}
        run={(fn) => act.mutate(fn)}
        busy={act.isPending}
        error={isAppError(act.error) ? act.error : undefined}
      />
    </div>
  );
}

function Spend({ row, withBudget }: { row: TeamRow; withBudget?: boolean }) {
  const spend = row.spend?.costUsd ?? "0.00";
  const pct = Math.round(percent(spend, row.team.maxBudgetUsd));
  return (
    <span>
      {format(spend)}
      {withBudget && ` / ${format(row.team.maxBudgetUsd)}`}{" "}
      <span className="sr-only">({pct}% of budget)</span>
      {withBudget && <Override team={row.team} compact />}
    </span>
  );
}

function Override({ team, compact }: { team: TeamRecord; compact?: boolean }) {
  const [now] = useState(() => Date.now());
  if (!overrideActive(team, now) || team.ceilingOverrideUsd == null) return compact ? null : <>—</>;
  return (
    <div>
      Ceiling {format(team.ceilingOverrideUsd)}
      {team.ceilingOverrideExpiresAt && (
        <>
          {" "}
          until{" "}
          <time
            dateTime={team.ceilingOverrideExpiresAt}
            title={utcTitle(team.ceilingOverrideExpiresAt)}
          >
            {formatLocal(team.ceilingOverrideExpiresAt)}
          </time>
        </>
      )}
    </div>
  );
}
