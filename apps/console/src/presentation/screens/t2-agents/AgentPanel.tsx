import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { AgentRecord } from "../../../application/ports/agents.js";
import { can } from "../../../domain/me.js";
import { agentView } from "../../../domain/status.js";
import { Alert, Button, StatusIndicator, Tabs } from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { EditAgentDialog, PauseDialog, SnapshotDialog } from "./dialogs.js";
import { agentsKey } from "./keys.js";
import { panelTabs } from "./panelTabs.js";

/**
 * The detail panel under the table (WEB-US-25.2): *Restart*, *Pause* or *Resume*, *Take snapshot* and *Edit*
 * for team-admins; for viewers the same panel with every action disabled "Requires team-admin" (25.5).
 */
export function AgentPanel({ teamId, agent }: { teamId: string; agent: AgentRecord }) {
  const agents = useService("agents");
  const me = useMe();
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("agents:write");
  const [dialog, setDialog] = useState<"pause" | "snapshot" | "edit" | undefined>();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "details");
  const refresh = () => qc.invalidateQueries({ queryKey: agentsKey(teamId) });
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = isAppError(act.error) ? act.error : undefined;
  const tabs = panelTabs
    .filter((t) => can(me, t.permission, teamId))
    .map((t) => ({
      id: t.id,
      label: t.label,
      content: <t.Component teamId={teamId} agent={agent} />,
    }));

  return (
    <section aria-label={`Agent ${agent.name}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{agent.name}</h2>
        <StatusIndicator view={agentView(agent)} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Button
            disabledReason={reason}
            onClick={() => act.mutate(() => agents.restart(teamId, agent.id))}
          >
            Restart
          </Button>
          <Button disabledReason={reason} onClick={() => setDialog("pause")}>
            {agent.paused ? "Resume" : "Pause"}
          </Button>
          <Button disabledReason={reason} onClick={() => setDialog("snapshot")}>
            Take snapshot
          </Button>
          <Button disabledReason={reason} onClick={() => setDialog("edit")}>
            Edit
          </Button>
        </div>
      </div>
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The action was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Tabs label={`${agent.name} details`} activeId={tab} onChange={setTab} tabs={tabs} />
      {dialog === "pause" && (
        <PauseDialog
          resume={agent.paused}
          name={agent.name}
          onCancel={() => setDialog(undefined)}
          onConfirm={() =>
            act.mutate(() =>
              agent.paused ? agents.resume(teamId, agent.id) : agents.pause(teamId, agent.id),
            )
          }
        />
      )}
      {dialog === "snapshot" && (
        <SnapshotDialog
          pending={act.isPending}
          onCancel={() => setDialog(undefined)}
          onSubmit={(d) => act.mutate(() => agents.takeSnapshot(teamId, agent.id, d))}
        />
      )}
      {dialog === "edit" && (
        <EditAgentDialog
          teamId={teamId}
          agent={agent}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
