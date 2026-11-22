import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { WorkOrderRepoRecord } from "../../../application/ports/workOrders.js";
import { directoryLabel } from "../../../application/usecases/teamDirectory/TeamDirectoryUseCases.js";
import {
  isOpen,
  ownerSourceLabel,
  repoRef,
} from "../../../application/usecases/workOrders/WorkOrdersUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import { label } from "../../../domain/labels.js";
import { can } from "../../../domain/me.js";
import { format } from "../../../domain/money.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  KeyValue,
  PageHeader,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { RepoStatus, SlaState, WorkOrderStatus } from "../p3-work-orders/views.js";

/**
 * P6 (WEB-US-40.5, 40.6): SLA state, the remediation team with spend against the cap, one row per repository
 * with its status, PR and notifications sent. *Cancel* asks for a reason. A team caller sees it read-only and
 * only with their own repositories (the API returns those); a work order with no link to them is not found.
 */
export default function P6() {
  const { id = "" } = useParams();
  const location = useLocation();
  // the create response says where each owner came from; the stored work order does not
  const created = (location.state as { created?: readonly WorkOrderRepoRecord[] } | null)?.created;
  const sourceOf = (r: WorkOrderRepoRecord) =>
    r.ownerSource ?? created?.find((c) => repoRef(c) === repoRef(r))?.ownerSource;
  const uc = useService("workOrders");
  const directory = useOptionalService("teamDirectory");
  const overview = useOptionalService("overview");
  const me = useMe();
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const key = queryKey({ area: "workOrders", resource: "detail", id });

  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => uc.get(id, signal),
    retry: false,
  });
  const w = q.data;
  const teams = useQuery({
    queryKey: queryKey({ area: "teamDirectory", resource: "list" }),
    queryFn: ({ signal }) => (directory as NonNullable<typeof directory>).list(signal),
    enabled: directory !== undefined && can(me, "teams:read-directory"),
    retry: false,
  });
  const nameOf = (teamId?: string | null) => {
    if (!teamId) return undefined;
    const t = (teams.data ?? []).find((x) => x.id === teamId);
    return t ? directoryLabel(t) : teamId;
  };
  const canSeeSpend = w?.teamId ? can(me, "budgets:read", w.teamId) : false;
  const spend = useQuery({
    queryKey: queryKey({ area: "workOrders", resource: "spend", id }),
    queryFn: ({ signal }) =>
      (overview as NonNullable<typeof overview>).budgetBurn(w?.teamId as string, signal),
    enabled: overview !== undefined && canSeeSpend,
    retry: false,
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => uc.cancel(id, reason),
    onSuccess: () => {
      setCancelling(false);
      void qc.invalidateQueries({ queryKey: ["workOrders"] });
    },
  });

  if (q.isPending) return <p role="status">Loading…</p>;
  if (q.isError) {
    if (isAppError(q.error) && q.error.kind === "not-found") return <NotFoundPage />;
    return (
      <Alert kind="error" title="The work order could not be loaded">
        {isAppError(q.error) ? q.error.message : "Try again."}
      </Alert>
    );
  }
  if (!w) return <NotFoundPage />;

  const writeReason = gate(me, "work-orders:write");
  const cancelReason = writeReason ?? (isOpen(w) ? undefined : "The work order is closed");
  const err = cancel.error && isAppError(cancel.error) ? cancel.error : undefined;
  const budget = spend.data?.budget;

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Work orders", to: "/work-orders" },
          { label: w.title },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title={w.title}
        actions={
          <Button disabledReason={cancelReason} onClick={() => setCancelling(true)}>
            Cancel work order
          </Button>
        }
      />
      {err && !cancelling && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The work order was not cancelled"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Card title="Summary">
        <KeyValue
          items={[
            { label: "Status", value: <WorkOrderStatus status={w.status} /> },
            { label: "SLA", value: <SlaState state={w.slaState} /> },
            { label: "SLA due", value: formatLocal(w.slaDueAt) },
            { label: "Severity", value: label("severity", w.severity) },
            { label: "CVE", value: w.cveId ?? "—" },
            {
              label: "Remediation team",
              value: w.teamId ? (
                can(me, "teams:read", w.teamId) ? (
                  <Link to={`/t/${w.teamId}`}>{nameOf(w.teamId)}</Link>
                ) : (
                  nameOf(w.teamId)
                )
              ) : (
                "Not assigned yet"
              ),
            },
            {
              label: "Spend against cap",
              value: budget
                ? `${format(budget.spentUsd)} of ${format(w.budgetUsd ?? budget.amountUsd)}`
                : `Cap ${w.budgetUsd ? format(w.budgetUsd) : "—"}`,
            },
            {
              label: "Progress",
              value: w.progress
                ? `${w.progress.prsMerged} merged, ${w.progress.prsOpen} PRs open, ${w.progress.notAffected} not affected, ${w.progress.failedOrSkipped} failed or skipped, ${w.progress.remaining} remaining`
                : "—",
            },
            ...(w.cancelReason ? [{ label: "Cancelled because", value: w.cancelReason }] : []),
          ]}
        />
      </Card>
      <Card title="Repositories">
        <Table<WorkOrderRepoRecord>
          id="work-order-repos"
          caption="Repositories"
          filterLabel="Find repositories"
          emptyText="No repositories."
          columns={[
            {
              id: "repo",
              header: "Repository",
              alwaysVisible: true,
              sortValue: (r) => repoRef(r),
              text: (r) => repoRef(r),
              cell: (r) => <code>{repoRef(r)}</code>,
            },
            {
              id: "owner",
              header: "Owner",
              text: (r) => `${nameOf(r.owningTeamId) ?? ""} ${r.owningContact ?? ""}`,
              cell: (r) => (
                <>
                  {[nameOf(r.owningTeamId), r.owningContact].filter(Boolean).join(", ") || "—"}
                  {ownerSourceLabel(sourceOf(r)) && <> ({ownerSourceLabel(sourceOf(r))})</>}
                </>
              ),
            },
            {
              id: "status",
              header: "Status",
              text: (r) => label("repoStatus", r.status),
              cell: (r) => <RepoStatus status={r.status} />,
            },
            {
              id: "pr",
              header: "Pull request",
              cell: (r) =>
                r.prUrl ? (
                  <a href={r.prUrl} target="_blank" rel="noreferrer">
                    {r.prNumber ? `#${r.prNumber}` : "Open"}
                  </a>
                ) : (
                  "—"
                ),
            },
            {
              id: "notifications",
              header: "Notifications sent",
              text: (r) => r.notifications.map((n) => n.recipient).join(" "),
              cell: (r) =>
                r.notifications.length === 0
                  ? "None"
                  : r.notifications
                      .map((n) => `${n.kind} to ${n.recipient} (${formatLocal(n.sentAt)})`)
                      .join("; "),
            },
          ]}
          items={w.repos}
          getRowId={(r) => repoRef(r)}
        />
      </Card>
      {cancelling && (
        <ConfirmDialog
          title="Cancel work order"
          confirmLabel="Cancel work order"
          withNote={{ label: "Reason", required: true }}
          onCancel={() => setCancelling(false)}
          onConfirm={(reason) => cancel.mutate(reason ?? "")}
        >
          {err && (
            <Alert
              kind="error"
              title={err.isAccessDenied ? "You do not have access" : "Not cancelled"}
            >
              {err.message}
            </Alert>
          )}
          <p>Teams working on it are told it was cancelled.</p>
          <CliPreview
            command={buildCli("CancelWorkOrder", { workOrderId: id, reason: "<reason>" })}
          />
        </ConfirmDialog>
      )}
    </div>
  );
}
