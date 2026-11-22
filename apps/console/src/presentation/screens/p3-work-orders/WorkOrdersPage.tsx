import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { WorkOrderRecord } from "../../../application/ports/workOrders.js";
import { directoryLabel } from "../../../application/usecases/teamDirectory/TeamDirectoryUseCases.js";
import {
  SEVERITIES,
  SLA_STATES,
  STATUSES,
} from "../../../application/usecases/workOrders/WorkOrdersUseCases.js";
import { label } from "../../../domain/labels.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  PageHeader,
  SelectInput,
  Table,
  Toolbar,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { SlaState, WorkOrderStatus } from "./views.js";

const opts = (xs: readonly string[], group: "workOrderStatus" | "severity" | "slaState") =>
  xs.map((v) => ({ value: v, label: label(group, v) }));

/**
 * P3 (WEB-US-40.1): work orders filtered by status, severity, SLA state and team, most severe first. Team
 * names come from the team directory, which a security operator can read.
 */
export function WorkOrdersPage() {
  const uc = useService("workOrders");
  const directory = useOptionalService("teamDirectory");
  const me = useMe();
  const navigate = useNavigate();
  const [f, setF] = useState({ status: "", severity: "", slaState: "", teamId: "" });
  const reason = gate(me, "work-orders:write");

  const list = useQuery({
    queryKey: queryKey({ area: "workOrders", resource: "list", params: f }),
    queryFn: ({ signal }) =>
      uc.list(
        {
          status: f.status || undefined,
          severity: f.severity || undefined,
          slaState: f.slaState || undefined,
          teamId: f.teamId || undefined,
        },
        signal,
      ),
  });
  const teams = useQuery({
    queryKey: queryKey({ area: "teamDirectory", resource: "list" }),
    queryFn: ({ signal }) => (directory as NonNullable<typeof directory>).list(signal),
    enabled: directory !== undefined,
    retry: false,
  });
  const names = new Map((teams.data ?? []).map((t) => [t.id, directoryLabel(t)]));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Work orders" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Work orders"
        description="Remediation work assigned to teams, with its SLA and progress."
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => navigate("/work-orders/new")}
          >
            Create work order
          </Button>
        }
      />
      <Toolbar>
        <SelectInput
          aria-label="Status"
          value={f.status}
          onChange={set("status")}
          placeholder="Any status"
          options={opts(STATUSES, "workOrderStatus")}
        />
        <SelectInput
          aria-label="Severity"
          value={f.severity}
          onChange={set("severity")}
          placeholder="Any severity"
          options={opts(SEVERITIES, "severity")}
        />
        <SelectInput
          aria-label="SLA state"
          value={f.slaState}
          onChange={set("slaState")}
          placeholder="Any SLA state"
          options={opts(SLA_STATES, "slaState")}
        />
        {directory && (
          <SelectInput
            aria-label="Team"
            value={f.teamId}
            onChange={set("teamId")}
            placeholder="Any team"
            options={(teams.data ?? []).map((t) => ({ value: t.id, label: directoryLabel(t) }))}
          />
        )}
      </Toolbar>
      {list.isError && isAppError(list.error) && (
        <Alert
          kind="error"
          title={
            list.error.isAccessDenied ? "You do not have access" : "Work orders could not be loaded"
          }
          requestId={list.error.requestId}
        >
          {list.error.message}
        </Alert>
      )}
      <Table<WorkOrderRecord>
        id="work-orders"
        caption="Work orders"
        filterLabel="Find work orders"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        emptyText="No work orders match."
        columns={[
          {
            id: "title",
            header: "Title",
            alwaysVisible: true,
            sortValue: (w) => w.title,
            text: (w) => `${w.title} ${w.cveId ?? ""}`,
            cell: (w) => <Link to={`/work-orders/${w.id}`}>{w.title}</Link>,
          },
          {
            id: "cve",
            header: "CVE",
            sortValue: (w) => w.cveId ?? "",
            cell: (w) => w.cveId ?? "—",
          },
          {
            id: "severity",
            header: "Severity",
            sortValue: (w) => SEVERITIES.indexOf(w.severity as (typeof SEVERITIES)[number]),
            text: (w) => label("severity", w.severity),
            cell: (w) => label("severity", w.severity),
          },
          {
            id: "status",
            header: "Status",
            text: (w) => label("workOrderStatus", w.status),
            cell: (w) => <WorkOrderStatus status={w.status} />,
          },
          {
            id: "sla",
            header: "SLA",
            text: (w) => label("slaState", w.slaState),
            cell: (w) => <SlaState state={w.slaState} />,
          },
          {
            id: "due",
            header: "Due",
            sortValue: (w) => w.slaDueAt,
            text: (w) => formatLocal(w.slaDueAt),
            cell: (w) => <time dateTime={w.slaDueAt}>{formatLocal(w.slaDueAt)}</time>,
          },
          {
            id: "team",
            header: "Team",
            text: (w) => (w.teamId ? (names.get(w.teamId) ?? w.teamId) : ""),
            cell: (w) => (w.teamId ? (names.get(w.teamId) ?? w.teamId) : "Unassigned"),
          },
          {
            id: "progress",
            header: "Repositories",
            text: (w) =>
              w.progress
                ? `${w.progress.prsMerged + w.progress.notAffected} of ${w.progress.repos}`
                : "",
            cell: (w) =>
              w.progress
                ? `${w.progress.prsMerged + w.progress.notAffected} of ${w.progress.repos} done`
                : "—",
          },
        ]}
        items={list.data ?? []}
        getRowId={(w) => w.id}
      />
    </div>
  );
}
