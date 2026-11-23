import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { OrchestrationRecord } from "../../../application/ports/orchestration.js";
import { isAgentPending } from "../../../application/usecases/orchestration/OrchestrationUseCases.js";
import { can } from "../../../domain/me.js";
import { ORCHESTRATION_TABS } from "../../../domain/navigation.js";
import { toolLabel } from "../../../domain/orchestration.js";
import {
  ActionsMenu,
  Alert,
  Breadcrumbs,
  Card,
  OrchestrationMark,
  PageHeader,
  Tabs,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { AgentConfiguration } from "../t2-agents/AgentConfiguration.js";
import { LogsTab } from "../t2-agents/tabs/logs/LogsTab.js";
import { RevisionsTab } from "../t2-agents/tabs/revisions/RevisionsTab.js";
import { UsageTab } from "../t2-agents/tabs/usage/UsageTab.js";
import { ConnectedAgentsPanel } from "./ConnectedAgentsPanel.js";
import { ChangeToolDialog, EditEndpointsDialog, RotateKeysDialog } from "./dialogs.js";
import { ConditionAlerts, GuidancePanel } from "./guidance.js";
import { orchAgentKey, orchKey } from "./keys.js";
import { EndpointsPanel, ManagedSecretsPanel, RecentAccessPanel, StatusPanel } from "./panels.js";
import { ViewerBanner } from "./ViewerBanner.js";

/**
 * T17 and T18, and V4 (WEB-US-44..50, 56): the team's orchestration agent. The *Collaboration* tab holds the tool,
 * the endpoints and the links; *Agent configuration*, *Usage*, *Logs* and *Revisions* are the shared agent tabs.
 * Team-admins change things; viewers and collaborators see the same page read-only. The API decides.
 */
export default function OrchestrationPage({ viewer = false }: { viewer?: boolean }) {
  const { teamId = "", tab: tabParam } = useParams();
  const orch = useService("orchestration");
  const agents = useService("agents");
  const me = useMe();

  const navigate = useNavigate();
  const write = useTeamWriteGate(teamId);
  const manageReason = viewer ? "Requires team-admin" : write.reasonFor("collaboration:manage");
  const canAccess = can(me, "collaboration:access", teamId);
  const q = usePolledQuery<OrchestrationRecord>({
    queryKey: orchKey(teamId),
    queryFn: ({ signal }) => orch.get(teamId, signal),
    phasesOf: (d) => [d.phase],
  });
  const agentQ = useQuery({
    queryKey: orchAgentKey(teamId),
    queryFn: ({ signal }) => agents.orchestrationAgent(teamId, signal),
  });
  const [dialog, setDialog] = useState<"edit" | "rotate" | "tool" | undefined>();
  const tab = ORCHESTRATION_TABS.find((t) => t.id === tabParam)?.id ?? "collaboration";
  const goTab = (id: string) =>
    navigate(`/t/${teamId}/orchestration${id === "collaboration" ? "" : `/${id}`}`);

  const pending = isAgentPending(q.error);
  const record = q.data;
  const tool = record ? toolLabel(record.tool) : "the collaboration tool";
  const agent = agentQ.data;
  const agentTab = (node: (a: NonNullable<typeof agent>) => React.ReactNode) =>
    agent ? node(agent) : <p role="status">Loading the orchestration agent…</p>;

  const content: Record<string, React.ReactNode> = {
    collaboration: record && (
      <>
        <ConditionAlerts record={record} />
        <Card>
          <StatusPanel teamId={teamId} record={record} />
        </Card>
        <Card>
          <EndpointsPanel
            teamId={teamId}
            record={record}
            suspended={write.suspended}
            canAccess={canAccess}
          />
        </Card>
        <Card>
          <ConnectedAgentsPanel teamId={teamId} record={record} manageReason={manageReason} />
        </Card>
        <Card>
          <ManagedSecretsPanel teamId={teamId} agentId={record.agentId} />
        </Card>
        <Card>
          <RecentAccessPanel teamId={teamId} />
        </Card>
        <Card>
          <GuidancePanel teamId={teamId} record={record} />
        </Card>
      </>
    ),
    config: agentTab((a) => (
      <AgentConfiguration teamId={teamId} agent={a} variant="orchestration" />
    )),
    usage: agentTab((a) => <UsageTab teamId={teamId} agent={a} />),
    logs: agentTab((a) => <LogsTab teamId={teamId} agent={a} />),
    revisions: agentTab((a) => <RevisionsTab teamId={teamId} agent={a} />),
  };

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Orchestration" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Orchestration"
        description={`The team's orchestration agent runs ${tool}, where your people and agents work together.`}
        infoHref="/docs/orchestration"
        {...(viewer ? { badge: "Read-only" } : {})}
        actions={
          <ActionsMenu
            actions={[
              {
                id: "edit",
                label: "Edit endpoints",
                onSelect: () => setDialog("edit"),
                ...(manageReason ? { disabledReason: manageReason } : {}),
              },
              {
                id: "tool",
                label: "Change tool",
                onSelect: () => setDialog("tool"),
                ...(manageReason ? { disabledReason: manageReason } : {}),
              },
              {
                id: "rotate",
                label: "Rotate tool keys",
                onSelect: () => setDialog("rotate"),
                ...((manageReason ??
                (record?.tool === "paperclip" ? undefined : "Not used by this tool"))
                  ? {
                      disabledReason: (manageReason ?? "Not used by this tool") as string,
                    }
                  : {}),
              },
            ]}
          />
        }
      />
      {viewer && <ViewerBanner teamId={teamId} />}
      {q.isPending && <p role="status">Loading orchestration…</p>}
      {pending && (
        <Alert kind="info" title="Orchestration agent being created">
          <OrchestrationMark /> This team's orchestration agent is being created. This page fills in
          when it is ready.
        </Alert>
      )}
      {q.isError && !pending && (
        <Alert
          kind="error"
          title="Orchestration could not be loaded"
          requestId={isAppError(q.error) ? q.error.requestId : undefined}
        >
          {isAppError(q.error) ? q.error.message : "The request failed"}
        </Alert>
      )}
      {record && (
        <>
          <Tabs
            label="Orchestration"
            activeId={tab}
            onChange={goTab}
            tabs={ORCHESTRATION_TABS.map((t) => ({
              id: t.id,
              label: t.label,
              content: content[t.id] ?? null,
            }))}
          />
          {dialog === "edit" && (
            <EditEndpointsDialog
              teamId={teamId}
              record={record}
              onClose={() => setDialog(undefined)}
            />
          )}
          {dialog === "tool" && (
            <ChangeToolDialog
              teamId={teamId}
              record={record}
              onClose={() => setDialog(undefined)}
            />
          )}
          {dialog === "rotate" && (
            <RotateKeysDialog teamId={teamId} onClose={() => setDialog(undefined)} />
          )}
        </>
      )}
    </div>
  );
}
