import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { RevisionRecord } from "../../../../../application/ports/history.js";
import { formatLocal, utcTitle } from "../../../../../domain/time.js";
import {
  Alert,
  Card,
  DiffView,
  FormField,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { useServerPages } from "../../../../components/useServerPages.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";

/** *Config revisions*: revisions per resource with author and time; two selected show a diff (WEB-US-35.2). */
export function RevisionsTab({ teamId }: { teamId: string }) {
  const history = useService("history");
  const [kind, setKind] = useState("");
  const [resource, setResource] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const pages = useServerPages({
    load: (req) =>
      history
        .revisionsPage(
          teamId,
          { resourceKind: kind || undefined, resourceId: resource || undefined },
          req,
        )
        .then((p) => ({ items: [...p.items], nextToken: p.nextToken })),
    defaultPageSize: 25,
  });
  const { reload } = pages;
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new filter starts again from the first page
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
    setSelected([]);
  }, [kind, resource]);

  const byId = new Map(pages.items.map((r) => [rowId(r), r]));
  const [a, b] = selected.map((id) => byId.get(id)?.revision);
  const diff = useQuery({
    queryKey: queryKey({ area: "revisions", teamId, resource: "diff", params: { a, b } }),
    queryFn: ({ signal }) => history.diff(teamId, a as number, b as number, signal),
    enabled: a !== undefined && b !== undefined,
  });

  return (
    <div>
      <Card title="Config revisions">
        <div style={{ display: "flex", gap: 12, alignItems: "end", marginBottom: 12 }}>
          <FormField label="Resource kind">
            <TextInput value={kind} onChange={(e) => setKind(e.target.value)} />
          </FormField>
          <FormField label="Resource id">
            <TextInput value={resource} onChange={(e) => setResource(e.target.value)} />
          </FormField>
        </div>
        <p>Select two revisions of the same resource to compare them.</p>
        <Table
          id="team-revisions"
          caption="Config revisions"
          filterLabel="Filter this page"
          status={pages.status}
          error={isAppError(pages.error) ? pages.error.message : undefined}
          notice={pages.notice}
          emptyText="No revisions."
          selection={{
            mode: "multi",
            selected,
            // two at most: a third replaces the oldest choice
            onChange: (ids) => setSelected(ids.slice(-2)),
          }}
          columns={[
            {
              id: "resource",
              header: "Resource",
              alwaysVisible: true,
              sortValue: (r) => `${r.resourceKind} ${r.resourceId}`,
              cell: (r) => `${r.resourceKind} ${r.resourceId}`,
            },
            {
              id: "revision",
              header: "Revision",
              sortValue: (r) => r.revision,
              cell: (r) => r.revision,
            },
            {
              id: "operation",
              header: "Operation",
              sortValue: (r) => r.operation,
              cell: (r) => r.operation,
            },
            {
              id: "by",
              header: "Changed by",
              sortValue: (r) => r.changedBy,
              cell: (r) => r.changedBy,
            },
            {
              id: "at",
              header: "Changed at",
              sortValue: (r) => r.changedAt,
              cell: (r) => (
                <time dateTime={r.changedAt} title={utcTitle(r.changedAt)}>
                  {formatLocal(r.changedAt)}
                </time>
              ),
            },
          ]}
          items={pages.items}
          getRowId={rowId}
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
      {selected.length === 2 && (
        <Card title="Changes between the two revisions">
          {diff.isError ? (
            <Alert
              kind="error"
              requestId={isAppError(diff.error) ? diff.error.requestId : undefined}
            >
              {diff.error instanceof Error
                ? diff.error.message
                : "The revisions could not be compared."}
            </Alert>
          ) : diff.data ? (
            <div>
              <p>
                Revision {diff.data.older.revision} to revision {diff.data.newer.revision} of{" "}
                {diff.data.newer.resourceKind} {diff.data.newer.resourceId}
              </p>
              {diff.data.before === diff.data.after ? (
                <p>No differences.</p>
              ) : (
                <DiffView before={diff.data.before} after={diff.data.after} />
              )}
            </div>
          ) : (
            <p role="status">Loading…</p>
          )}
        </Card>
      )}
    </div>
  );
}

const rowId = (r: RevisionRecord) => `${r.resourceKind}:${r.resourceId}:${r.revision}`;
