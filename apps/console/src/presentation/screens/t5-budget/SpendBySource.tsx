import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { BEDROCK_ROUTE, capWord } from "../../../domain/modelEndpoints.js";
import { Card, StatusIndicator, Table } from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";
import { usd } from "../sg-model-endpoints/shared.js";

/**
 * TG5 (screen 65, MEG-WEB-5): month-to-date spend by route, and whether each counts against the hard cap. Per-token
 * routes and Bedrock are capped; capacity and free routes are metered and reported only.
 */
export function SpendBySource({ teamId }: { teamId: string }) {
  const reports = useOptionalService("inferenceReports");
  const q = useQuery({
    queryKey: queryKey({ area: "inference-report", teamId, resource: "spend-by-route" }),
    queryFn: ({ signal }) =>
      reports
        ? reports.run({ level: "team", teamId }, { range: "mtd", groupBy: ["route"] }, signal)
        : Promise.reject(new Error("no reports service")),
    enabled: reports !== undefined,
    retry: false,
  });
  if (!reports) return null;
  const rows = (q.data?.rows ?? []).filter((r) => r.route);
  return (
    <Card title="By route">
      <Table
        id="budget-by-route"
        caption="Spend by route this month"
        status={q.isPending ? "loading" : q.isError ? "error" : "ready"}
        emptyText="No calls through the team gateway this month."
        columns={[
          {
            id: "route",
            header: "Route",
            alwaysVisible: true,
            sortValue: (r) => r.route ?? "",
            cell: (r) => <code>{r.route}</code>,
          },
          {
            id: "cap",
            header: "Budget",
            text: (r) => capWord(r.route === BEDROCK_ROUTE ? "bedrock" : (r.pricingMode ?? "")),
            cell: (r) => {
              const w = capWord(r.route === BEDROCK_ROUTE ? "bedrock" : (r.pricingMode ?? ""));
              return <StatusIndicator view={{ word: w, dot: w === "Capped" ? "blue" : "grey" }} />;
            },
          },
          { id: "calls", header: "Calls", cell: (r) => r.calls.toLocaleString("en-US") },
          {
            id: "cost",
            header: "Cost",
            sortValue: (r) => Number(r.costUsd),
            cell: (r) => usd(r.costUsd),
          },
        ]}
        items={rows}
        getRowId={(r) => r.route ?? ""}
      />
      <p>
        <Link to={`/t/${teamId}/reports/inference`}>Open the inference report</Link>
      </p>
    </Card>
  );
}
