import { Link, useLocation, useSearchParams } from "react-router";
import type { ReportKind } from "../../../application/ports/reports.js";
import { Breadcrumbs, PageHeader, Tabs } from "../../components/index.js";
import type { FilterKey } from "../../components/report-controls/index.js";
import { ReportPanel } from "../t11-reports/ReportPanel.js";
import { Reconciliation } from "./Reconciliation.js";

interface Tab {
  id: string;
  label: string;
  kind: ReportKind;
  title: string;
  groupBy: string[];
  defaultGroupBy: string[];
  filters: FilterKey[];
}

const TABS: Tab[] = [
  {
    id: "costs",
    label: "Cost",
    kind: "costs",
    title: "Cost by team",
    groupBy: ["team", "day", "model"],
    defaultGroupBy: ["team"],
    filters: ["teamId", "modelId"],
  },
  {
    id: "usage",
    label: "Usage",
    kind: "usage",
    title: "Usage by model",
    groupBy: ["model", "team", "day"],
    defaultGroupBy: ["model"],
    filters: ["teamId", "modelId"],
  },
  {
    id: "activity",
    label: "Activity",
    kind: "activity",
    title: "Agent activity",
    groupBy: ["team", "agent", "day"],
    defaultGroupBy: ["team"],
    filters: ["teamId"],
  },
  {
    id: "traffic",
    label: "External systems",
    kind: "traffic",
    title: "External traffic",
    groupBy: ["system", "team", "day"],
    defaultGroupBy: ["system"],
    filters: ["teamId", "systemId"],
  },
  {
    id: "collaboration",
    label: "Collaboration",
    kind: "collaboration",
    title: "Collaboration access",
    groupBy: ["team", "day", "surface", "reason", "person"],
    defaultGroupBy: ["team"],
    filters: [],
  },
];

/** S8 (WEB-US-38): service-wide cost, usage, activity and traffic reports, and the cost reconciliation. */
export function ServiceReportsPage() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const wanted = pathname.endsWith("/reconciliation") ? "reconciliation" : params.get("tab");
  const active = [...TABS.map((t) => t.id), "reconciliation"].includes(wanted ?? "")
    ? (wanted as string)
    : "costs";
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Reports" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Service reports" infoHref="/docs/reports" />
      <Tabs
        label="Service reports"
        activeId={active}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={[
          ...TABS.map((t) => ({
            id: t.id,
            label: t.label,
            content: (
              <ReportPanel
                scope={{ level: "service" }}
                kind={t.kind}
                title={t.title}
                groupBy={t.groupBy}
                defaultGroupBy={t.defaultGroupBy}
                filters={t.filters}
                csvDisabledReason={undefined}
              />
            ),
          })),
          { id: "reconciliation", label: "Reconciliation", content: <Reconciliation /> },
        ]}
      />
    </div>
  );
}
