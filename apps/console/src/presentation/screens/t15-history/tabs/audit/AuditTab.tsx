import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { isAppError } from "../../../../../application/errors.js";
import { formatLocal, utcTitle } from "../../../../../domain/time.js";
import { Alert, Button, Card, Table } from "../../../../components/index.js";
import { useServerPages } from "../../../../components/useServerPages.js";
import { useService } from "../../../../services.js";
import { AuditFilters, useAuditFilterParams } from "../../AuditFilters.js";
import { downloadText } from "../../download.js";

/** *Activity & audit*: the team's audit records with the S5 filters and a CSV download (WEB-US-35.1). */
export function AuditTab({ teamId }: { teamId: string }) {
  const history = useService("history");
  const [filter, setFilter] = useAuditFilterParams();
  const filterKey = JSON.stringify(filter);
  const pages = useServerPages({
    load: (req) =>
      history
        .auditPage(teamId, filter, req)
        .then((p) => ({ items: [...p.items], nextToken: p.nextToken })),
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
      const f = await history.auditCsv(teamId, filter);
      downloadText(f.filename, f.text);
    },
  });
  const err = isAppError(pages.error) ? pages.error : undefined;
  const periodError = err?.fields.to;

  return (
    <Card
      title="Activity & audit"
      actions={
        <Button disabled={csv.isPending} onClick={() => csv.mutate()}>
          Download CSV
        </Button>
      }
    >
      {isAppError(csv.error) && !csv.error.isAccessDenied && (
        <Alert kind="error" title="The CSV could not be downloaded" requestId={csv.error.requestId}>
          {csv.error.message}
        </Alert>
      )}
      <AuditFilters value={filter} onChange={setFilter} error={periodError} />
      <Table
        id="team-audit"
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
          { id: "actor", header: "Actor", sortValue: (e) => e.actorId, cell: (e) => e.actorId },
          { id: "action", header: "Action", sortValue: (e) => e.action, cell: (e) => e.action },
          {
            id: "resource",
            header: "Resource",
            cell: (e) => (e.resourceKind ? `${e.resourceKind} ${e.resourceId ?? ""}`.trim() : "—"),
          },
          { id: "outcome", header: "Outcome", sortValue: (e) => e.outcome, cell: (e) => e.outcome },
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
  );
}
