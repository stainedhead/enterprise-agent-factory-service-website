import { isAppError } from "../../../../../application/errors.js";
import { formatLocal, utcTitle } from "../../../../../domain/time.js";
import { Table } from "../../../../components/index.js";
import { useServerPages } from "../../../../components/useServerPages.js";
import { useService } from "../../../../services.js";
import type { PanelTabProps } from "../../panelTabs.js";

/** *Revisions*: `ListRevisions` filtered to this agent (WEB-US-25.4). */
export function RevisionsTab({ teamId, agent }: PanelTabProps) {
  const history = useService("history");
  const pages = useServerPages({
    load: (req) =>
      history
        .revisionsPage(teamId, { resourceKind: "agent", resourceId: agent.id }, req)
        .then((p) => ({ items: [...p.items], nextToken: p.nextToken })),
    defaultPageSize: 10,
  });
  return (
    <Table
      id={`agent-revisions-${agent.id}`}
      caption={`Revisions of ${agent.name}`}
      status={pages.status}
      error={isAppError(pages.error) ? pages.error.message : undefined}
      emptyText="No revisions yet."
      notice={pages.notice}
      columns={[
        { id: "rev", header: "Revision", alwaysVisible: true, cell: (r) => `#${r.revision}` },
        { id: "op", header: "Operation", cell: (r) => r.operation },
        { id: "by", header: "Changed by", cell: (r) => r.changedBy },
        {
          id: "at",
          header: "Changed",
          cell: (r) => (
            <time dateTime={r.changedAt} title={utcTitle(r.changedAt)}>
              {formatLocal(r.changedAt)}
            </time>
          ),
        },
      ]}
      items={pages.items}
      getRowId={(r) => String(r.revision)}
      pagination={{
        pageSize: pages.pageSize,
        hasNext: pages.hasNext,
        hasPrev: pages.hasPrev,
        onNext: pages.next,
        onPrev: pages.prev,
        onPageSizeChange: pages.setPageSize,
      }}
    />
  );
}
