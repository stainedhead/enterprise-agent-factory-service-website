import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { CollaborationRecord } from "../../../application/ports/collaboration.js";
import { isAgentMissing } from "../../../application/usecases/collaboration/CollaborationUseCases.js";
import { reasonText, type Surface } from "../../../domain/collaboration.js";
import { can } from "../../../domain/me.js";
import { Alert, Breadcrumbs, Button, Card, PageHeader } from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { ConnectedAgentsPanel } from "./ConnectedAgentsPanel.js";
import { collabKey } from "./keys.js";
import { EndpointsPanel, ManagedSecretsPanel, RecentAccessPanel, StatusPanel } from "./panels.js";

/**
 * T16 and V3 (WEB-US-44..50): the team's Paperclip collaboration. Team-admins change the switches and the
 * links; viewers and collaborators see the same page read-only. The API decides; the gate is only UX.
 */
export default function CollaborationPage({ viewer = false }: { viewer?: boolean }) {
  const { teamId = "" } = useParams();
  const collab = useService("collaboration");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const write = useTeamWriteGate(teamId);
  const manageReason = viewer ? "Requires team-admin" : write.reasonFor("collaboration:manage");
  const canAccess = can(me, "collaboration:access", teamId);
  const q = usePolledQuery<CollaborationRecord>({
    queryKey: collabKey(teamId),
    queryFn: ({ signal }) => collab.get(teamId, signal),
    phasesOf: (d) => [d.phase],
  });
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const put = useMutation({
    mutationFn: (v: { surface: Surface; on: boolean }) => {
      const cur = q.data as CollaborationRecord;
      return collab.put(teamId, cur, {
        webUiEnabled: v.surface === "webUi" ? v.on : cur.webUiEnabled,
        restApiEnabled: v.surface === "restApi" ? v.on : cur.restApiEnabled,
      });
    },
    onSuccess: (r) => {
      setStale(false);
      setSaved(true);
      qc.setQueryData(collabKey(teamId), r);
    },
    onError: (e) => setStale(isAppError(e) && e.kind === "stale"),
  });
  const reload = () => {
    setStale(false);
    put.reset();
    void qc.invalidateQueries({ queryKey: collabKey(teamId) });
  };

  const missing = isAgentMissing(q.error) || isAgentMissing(put.error);
  const err = isAppError(put.error) && !missing ? put.error : undefined;
  const fieldReasons = err?.kind === "validation" ? Object.values(err.fields).map(reasonText) : [];

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Collaboration" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Collaboration"
        description="Paperclip, where your team's people and agents work together."
        infoHref="/docs/collaboration"
        {...(viewer ? { badge: "Read-only" } : {})}
      />
      {q.isPending && <p role="status">Loading collaboration…</p>}
      {missing && (
        <Card>
          <h2>This team has no collaboration agent</h2>
          <p>
            Each team can have one collaboration agent that runs Paperclip: a board, chat and roster
            for its people and agents.
          </p>
          <Button
            variant="primary"
            {...(write.reasonFor("agents:write")
              ? { disabledReason: write.reasonFor("agents:write") as string }
              : {})}
            onClick={() => navigate(`/t/${teamId}/agents/new?role=collaboration`)}
          >
            Create collaboration agent
          </Button>
        </Card>
      )}
      {q.isError && !missing && (
        <Alert
          kind="error"
          title="Collaboration could not be loaded"
          requestId={isAppError(q.error) ? q.error.requestId : undefined}
        >
          {isAppError(q.error) ? q.error.message : "The request failed"}
        </Alert>
      )}
      {saved && !put.isPending && !put.isError && (
        <Alert kind="success" title="Saved">
          Takes effect within a minute.
        </Alert>
      )}
      {stale && <ConflictAlert onReload={reload} requestId={err?.requestId} />}
      {err && !stale && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not saved" requestId={err.requestId}>
          {err.message}
          {fieldReasons.length > 0 && (
            <ul>
              {fieldReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {q.data && (
        <>
          <Card>
            <StatusPanel teamId={teamId} record={q.data} />
          </Card>
          <Card>
            <EndpointsPanel
              teamId={teamId}
              record={q.data}
              suspended={write.suspended}
              canAccess={canAccess}
              manageReason={manageReason}
              busy={put.isPending}
              onSwitch={(surface, on) => put.mutate({ surface, on })}
            />
          </Card>
          <Card>
            <ConnectedAgentsPanel teamId={teamId} record={q.data} manageReason={manageReason} />
          </Card>
          <Card>
            <ManagedSecretsPanel teamId={teamId} agentId={q.data.agentId} />
          </Card>
          <Card>
            <RecentAccessPanel teamId={teamId} />
          </Card>
        </>
      )}
    </div>
  );
}
