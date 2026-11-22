import { useQuery } from "@tanstack/react-query";
import { isAppError } from "../../../../../application/errors.js";
import { buildCli } from "../../../../../domain/cli.js";
import { Alert, Badge, CliPreview, Table } from "../../../../components/index.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import type { PanelTabProps } from "../../panelTabs.js";

/**
 * *Logs* (WD-29, CQ-6): the API has no log-read operation, so the tab names where the team's logs are
 * delivered and shows the CLI command for the destinations.
 */
export function LogsTab({ teamId }: PanelTabProps) {
  const agents = useService("agents");
  const list = useQuery({
    queryKey: queryKey({ area: "agents", teamId, resource: "log-destinations" }),
    queryFn: ({ signal }) => agents.logDestinations(teamId, signal),
  });
  return (
    <div>
      <Alert kind="info">
        The console does not show log content. Agent logs are delivered to the team's log
        destinations below.
      </Alert>
      <Table
        id="agent-log-destinations"
        caption="Log destinations"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No log destinations are configured for this team."
        columns={[
          { id: "name", header: "Name", alwaysVisible: true, cell: (d) => d.name },
          { id: "kind", header: "Kind", cell: (d) => d.kind },
          {
            id: "enabled",
            header: "State",
            cell: (d) => (d.enabled ? "Enabled" : <Badge>Disabled</Badge>),
          },
        ]}
        items={list.data ?? []}
        getRowId={(d) => d.id}
      />
      <CliPreview command={buildCli("ListLogDestinations", { teamId })} />
    </div>
  );
}
