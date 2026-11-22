import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import { eventNote } from "../../../application/usecases/adminAudit/AdminAuditUseCases.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  FormField,
  PageHeader,
  SelectInput,
  Table,
} from "../../components/index.js";
import { useServerPages } from "../../components/useServerPages.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { AuditFilters, useAuditFilterParams } from "../t15-history/AuditFilters.js";
import { downloadText } from "../t15-history/download.js";

/**
 * S5 (WEB-US-16): every audit record across teams. Filters by team, actor, action, outcome and period go to the
 * API as query parameters; denied requests show the permission they needed and drift corrections the object.
 */
export function AuditPage() {
  const audit = useService("adminAudit");
  const teams = useOptionalService("teams");
  const [filter, setFilter] = useAuditFilterParams();
  const [params, setParams] = useSearchParams();
  const teamId = params.get("teamId") || undefined;
  const full = { ...filter, teamId };
  const filterKey = JSON.stringify(full);
  const teamList = useQuery({
    queryKey: queryKey({ area: "admin-audit", resource: "teams" }),
    queryFn: ({ signal }) =>
      teams ? teams.listRows({ maxResults: 100, signal }) : Promise.reject(new Error("no teams")),
    enabled: teams !== undefined,
    retry: false,
  });

  const pages = useServerPages({
    load: (req) =>
      audit.page(full, req).then((p) => ({ items: [...p.items], nextToken: p.nextToken })),
    defaultPageSize: 25,
  });
  const { reload } = pages;
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new filter starts again from the first page
  useEffect(() => {
    if (first.current) first.current = false;
    else reload();
  }, [filterKey]);

  const csv = useMutation({
    mutationFn: async () => {
      const f = await audit.csv(full);
      downloadText(f.filename, f.text);
    },
  });
  const err = isAppError(pages.error) ? pages.error : undefined;
  const periodError = err?.fields.to;

  const setTeam = (id: string) => {
    const p = new URLSearchParams(params);
    if (id) p.set("teamId", id);
    else p.delete("teamId");
    setParams(p, { replace: true });
  };

  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Audit log" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Audit log" infoHref="/docs/audit" />
      <Card
        title="Service audit events"
        actions={
          <Button disabled={csv.isPending} onClick={() => csv.mutate()}>
            Download CSV
          </Button>
        }
      >
        {isAppError(csv.error) && (
          <Alert
            kind="error"
            title={
              csv.error.isAccessDenied
                ? "You do not have access"
                : "The CSV could not be downloaded"
            }
            requestId={csv.error.requestId}
          >
            {csv.error.message}
          </Alert>
        )}
        <div style={{ marginBottom: 12 }}>
          <FormField label="Team">
            <SelectInput
              value={teamId ?? ""}
              placeholder="All teams"
              options={(teamList.data?.rows ?? []).map((r) => ({
                value: r.team.id,
                label: r.team.displayName,
              }))}
              onChange={(e) => setTeam(e.target.value)}
            />
          </FormField>
        </div>
        <AuditFilters
          value={filter}
          onChange={(next) => {
            setFilter(next);
          }}
          error={periodError}
        />
        <Table
          id="service-audit"
          caption="Audit events"
          filterLabel="Filter this page"
          status={pages.status}
          error={err && !periodError ? err.message : undefined}
          notice={pages.notice}
          emptyText="No events match."
          columns={[
            {
              id: "time",
              header: "Time",
              alwaysVisible: true,
              sortValue: (e) => e.occurredAt,
              cell: (e) => (
                <time dateTime={e.occurredAt} title={utcTitle(e.occurredAt)}>
                  {formatLocal(e.occurredAt)}
                </time>
              ),
            },
            {
              id: "team",
              header: "Team",
              sortValue: (e) => e.teamId ?? "",
              cell: (e) => e.teamId ?? "—",
            },
            { id: "actor", header: "Actor", sortValue: (e) => e.actorId, cell: (e) => e.actorId },
            { id: "action", header: "Action", sortValue: (e) => e.action, cell: (e) => e.action },
            {
              id: "resource",
              header: "Resource",
              cell: (e) =>
                e.resourceKind ? `${e.resourceKind} ${e.resourceId ?? ""}`.trim() : "—",
            },
            {
              id: "outcome",
              header: "Outcome",
              sortValue: (e) => e.outcome,
              text: (e) => e.outcome,
              cell: (e) => {
                const n = eventNote(e);
                if (n?.kind === "denied")
                  return (
                    <>
                      <strong>Denied</strong>
                      <div>
                        {n.permission ? (
                          <>
                            Requires <code>{n.permission}</code>
                          </>
                        ) : (
                          "Permission not reported"
                        )}
                      </div>
                    </>
                  );
                if (n?.kind === "drift")
                  return (
                    <>
                      <strong>Drift corrected</strong>
                      <div>{n.object}</div>
                    </>
                  );
                return e.outcome;
              },
            },
            {
              id: "request",
              header: "Request id",
              cell: (e) => (e.requestId ? <code>{e.requestId}</code> : "—"),
            },
          ]}
          items={pages.items}
          getRowId={(e) => String(e.id)}
          pagination={{
            pageSize: pages.pageSize,
            hasNext: pages.hasNext,
            hasPrev: pages.hasPrev,
            onNext: pages.next,
            onPrev: pages.prev,
            onPageSizeChange: pages.setPageSize,
          }}
        />
      </Card>
    </div>
  );
}
