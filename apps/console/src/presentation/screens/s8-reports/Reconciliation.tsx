import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ReconciliationRecord } from "../../../application/ports/reports.js";
import { format } from "../../../domain/money.js";
import {
  Alert,
  Card,
  FormField,
  SelectInput,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

const STATUSES = [
  { value: "over_threshold", label: "Over threshold" },
  { value: "missing_billing", label: "Missing billing" },
  { value: "ok", label: "OK" },
  { value: "", label: "All" },
];

const VIEW: Record<string, { word: string; dot: "green" | "red" | "amber" | "grey" }> = {
  ok: { word: "OK", dot: "green" },
  over_threshold: { word: "Over threshold", dot: "red" },
  missing_billing: { word: "Missing billing", dot: "amber" },
};
const label = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s;

/** S8 *Reconciliation* (WEB-US-38): team-days where the gateway estimate and the CUR billed figure differ. */
export function Reconciliation() {
  const reports = useService("reports");
  const [status, setStatus] = useState("over_threshold");
  const q = useQuery({
    queryKey: queryKey({ area: "reports", resource: "reconciliations", id: status }),
    queryFn: ({ signal }) => reports.reconciliations(status, signal),
  });
  const err = isAppError(q.error) ? q.error : undefined;
  return (
    <Card title="Cost reconciliation">
      <p>
        Gateway <em>estimatedUsd</em> is compared with the CUR <em>billedUsd</em> for each team-day.
        Billed figures arrive up to a day later.
      </p>
      <FormField label="Status">
        <SelectInput
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUSES}
        />
      </FormField>
      {err && (
        <Alert kind="error" title="Reconciliations could not be loaded" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Table
        id="reconciliations"
        caption="Cost reconciliations"
        filterLabel="Filter team-days"
        status={q.isPending ? "loading" : q.isError ? "error" : "ready"}
        emptyText="No team-days match."
        columns={[
          {
            id: "day",
            header: "Day",
            alwaysVisible: true,
            text: (r: ReconciliationRecord) => r.day,
            cell: (r: ReconciliationRecord) => r.day,
          },
          {
            id: "team",
            header: "Team",
            text: (r: ReconciliationRecord) => r.teamId,
            cell: (r: ReconciliationRecord) => r.teamId,
          },
          {
            id: "gateway",
            header: "Gateway estimate",
            text: (r: ReconciliationRecord) => r.gatewayUsd,
            cell: (r: ReconciliationRecord) => format(r.gatewayUsd),
          },
          {
            id: "billed",
            header: "Billed (CUR)",
            text: (r: ReconciliationRecord) => r.billedUsd,
            cell: (r: ReconciliationRecord) => format(r.billedUsd),
          },
          {
            id: "variance",
            header: "Variance",
            text: (r: ReconciliationRecord) => r.variancePct,
            cell: (r: ReconciliationRecord) => `${r.variancePct}%`,
          },
          {
            id: "status",
            header: "Status",
            text: (r: ReconciliationRecord) => label(r.status),
            cell: (r: ReconciliationRecord) => (
              <StatusIndicator view={VIEW[r.status] ?? { word: r.status, dot: "grey" }} />
            ),
          },
        ]}
        items={q.data ?? []}
        getRowId={(r: ReconciliationRecord) => `${r.teamId}/${r.day}`}
      />
    </Card>
  );
}
