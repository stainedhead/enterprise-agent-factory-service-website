import { useQuery } from "@tanstack/react-query";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { ReportPanel } from "../t11-reports/ReportPanel.js";

/**
 * Spend grouped by any tag key (WEB-US-19.2): the service cost report with the service tag keys offered in *Group
 * by*; records without a value for a key are reported under "(untagged)" by the API.
 */
export function SpendSection() {
  const tags = useService("adminServiceTags");
  const list = useQuery({
    queryKey: queryKey({ area: "admin-serviceTags", resource: "list" }),
    queryFn: ({ signal }) => tags.list(signal),
  });
  const keys = (list.data ?? []).map((t) => t.key);
  return (
    <ReportPanel
      scope={{ level: "service" }}
      kind="costs"
      title="Spend by tag"
      groupBy={["team", "day", "model"]}
      defaultGroupBy={["team"]}
      tagKeys={keys}
    />
  );
}
