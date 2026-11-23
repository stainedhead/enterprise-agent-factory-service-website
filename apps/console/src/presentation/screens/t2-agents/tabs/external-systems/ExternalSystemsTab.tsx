import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAppError } from "../../../../../application/errors.js";
import type { ExternalSystemRecord } from "../../../../../application/ports/externalSystems.js";
import { switchState } from "../../../../../application/usecases/externalSystems/ExternalSystemsUseCases.js";
import { Alert, Badge, Table } from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { SystemSwitch } from "../../../t9-external-systems/SystemSwitch.js";
import type { PanelTabProps } from "../../panelTabs.js";

/**
 * *External systems* (T10, WEB-US-32.3): the agent's effective access. A system off for the team or the
 * service is shown off and locked; one switched off here reads *Off at agent level*.
 */
export function ExternalSystemsTab({ teamId, agent }: PanelTabProps) {
  const systems = useService("externalSystems");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("external-systems:write");
  const key = queryKey({ area: "externalSystems", teamId, resource: "agent", id: agent.id });
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => systems.listAgent(teamId, agent.id, signal),
  });
  const toggle = useMutation({
    mutationFn: (v: { s: ExternalSystemRecord; on: boolean }) =>
      systems.setAgentState(teamId, agent.id, { id: v.s.id, version: v.s.version }, v.on),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const err = isAppError(toggle.error) ? toggle.error : undefined;
  return (
    <>
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Table
        id={`agent-external-systems-${agent.id}`}
        caption={`External systems of ${agent.name}`}
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No external systems are available to this agent."
        columns={[
          {
            id: "name",
            header: "System",
            alwaysVisible: true,
            text: (s) => s.name,
            cell: (s) => (
              <>
                {s.name} {s.unmetered && <Badge tone="teal">Unmetered</Badge>}
              </>
            ),
          },
          { id: "endpoints", header: "Endpoints", cell: (s) => s.endpoints.join(", ") },
          {
            id: "access",
            header: "Access",
            cell: (s) => (
              <SystemSwitch
                name={s.name}
                state={switchState(s, "agent")}
                reason={reason}
                busy={toggle.isPending}
                onChange={(on) => toggle.mutate({ s, on })}
              />
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(s) => s.id}
      />
    </>
  );
}
