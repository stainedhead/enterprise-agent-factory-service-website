import { useQuery } from "@tanstack/react-query";
import { isAppError } from "../../../../application/errors.js";
import type { CostTagStatusItem } from "../../../../application/ports/adminCostTagStatus.js";
import {
  flagFor,
  type TagFlag,
  UNSEEN_DAYS,
} from "../../../../application/usecases/adminCostTagStatus/AdminCostTagStatusUseCases.js";
import { formatLocal } from "../../../../domain/time.js";
import { Alert, Card, StatusIndicator, Table } from "../../../components/index.js";
import { gate } from "../../../hooks/gate.js";
import { queryKey } from "../../../query/keys.js";
import { useService } from "../../../services.js";
import { useMe } from "../../../shell/ShellContext.js";

const listKey = queryKey({ area: "admin-costTagStatus", resource: "list" });
const day = (iso?: string | null) => (iso ? formatLocal(iso) : "—");

const FLAG: Record<TagFlag, { word: string; dot: "green" | "amber" | "grey" }> = {
  ok: { word: "Healthy", dot: "green" },
  "not-seen": { word: "Not seen in report", dot: "amber" },
  "not-active": { word: "Not active", dot: "grey" },
};

/** Per key: seen in the CUR, first and last seen, AWS activation; flagged when not seen (WEB-US-19.3). */
export function TagStatusSection() {
  const svc = useService("adminCostTagStatus");
  const me = useMe();
  const denied = gate(me, "admin:cost-tag-status");
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => svc.list(signal),
    enabled: denied === undefined,
  });
  const flagged = (list.data ?? []).filter((t) => flagFor(t) === "not-seen");
  if (denied) return null;
  return (
    <Card title="Tag status">
      <p>
        Whether each tag key has appeared in the Cost and Usage Report, and whether AWS Billing has
        it active.
      </p>
      {flagged.length > 0 && (
        <Alert kind="warning" title="Active tags not seen in the report">
          {flagged.map((t) => t.key).join(", ")}: not seen for {UNSEEN_DAYS} days or more. Check
          that the key is activated in AWS Billing.
        </Alert>
      )}
      <Table<CostTagStatusItem>
        id="tag-status"
        caption="Tag status"
        filterLabel="Find tag keys"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No tag keys reported yet."
        columns={[
          {
            id: "key",
            header: "Key",
            alwaysVisible: true,
            sortValue: (t) => t.key,
            text: (t) => t.key,
            cell: (t) => <code>{t.key}</code>,
          },
          {
            id: "cur",
            header: "Seen in report",
            text: (t) => (t.seenInCur ? "Yes" : "No"),
            cell: (t) => (t.seenInCur ? "Yes" : "No"),
          },
          { id: "first", header: "First seen", cell: (t) => day(t.firstSeenAt) },
          { id: "last", header: "Last seen", cell: (t) => day(t.lastSeenAt) },
          {
            id: "aws",
            header: "AWS activation",
            text: (t) => t.awsStatus,
            cell: (t) => <span style={{ textTransform: "capitalize" }}>{t.awsStatus}</span>,
          },
          {
            id: "flag",
            header: "Status",
            text: (t) => FLAG[flagFor(t)].word,
            cell: (t) => <StatusIndicator view={FLAG[flagFor(t)]} />,
          },
        ]}
        items={list.data ?? []}
        getRowId={(t) => t.key}
      />
    </Card>
  );
}
