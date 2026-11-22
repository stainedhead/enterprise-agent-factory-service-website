import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { isAppError } from "../../../../application/errors.js";
import type { CollaborationRecord } from "../../../../application/ports/collaboration.js";
import { isAgentMissing } from "../../../../application/usecases/collaboration/CollaborationUseCases.js";
import { openPaperclipState, surfaceView } from "../../../../domain/collaboration.js";
import { can } from "../../../../domain/me.js";
import { Alert, Card, KeyValue, LinkButton, StatusIndicator } from "../../../components/index.js";
import { teamKey } from "../../../hooks/useTeamWriteGate.js";
import { useOptionalService } from "../../../services.js";
import { useMe } from "../../../shell/ShellContext.js";
import { collabKey } from "../../t16-collaboration/keys.js";

/**
 * *Collaboration* on T1 and V1 (WEB-US-53): the hostname, the two surfaces, the agent phase and *Open Paperclip*.
 * It has its own error and its own empty state; the card is absent without `collaboration:read`.
 */
export function CollaborationCard({ teamId }: { teamId: string }) {
  const me = useMe();
  const collab = useOptionalService("collaboration");
  const teams = useOptionalService("teams");
  const q = useQuery({
    queryKey: collabKey(teamId),
    queryFn: ({ signal }) =>
      collab ? collab.get(teamId, signal) : Promise.reject(new Error("no collaboration service")),
    enabled: collab !== undefined,
    retry: false,
  });
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) =>
      teams ? teams.get(teamId, signal) : Promise.reject(new Error("no teams service")),
    enabled: teams !== undefined,
  });
  const admin = can(me, "collaboration:manage", teamId);
  return (
    <Card title="Collaboration">
      {q.isPending && <p role="status">Loading collaboration…</p>}
      {isAgentMissing(q.error) && (
        <p>
          No collaboration agent.{" "}
          {admin ? (
            <Link to={`/t/${teamId}/agents/new?role=collaboration`}>
              Create collaboration agent
            </Link>
          ) : (
            <Link to={`/t/${teamId}/collaboration`}>Open collaboration</Link>
          )}
        </p>
      )}
      {q.isError && !isAgentMissing(q.error) && (
        <Alert kind="error" title="Collaboration could not be loaded">
          {isAppError(q.error) ? q.error.message : "The request failed"}
        </Alert>
      )}
      {q.data && (
        <>
          <KeyValue
            items={[
              {
                label: "Hostname",
                value: q.data.hostname ? <code>{q.data.hostname}</code> : "Not configured",
              },
              {
                label: "Web UI",
                value: <StatusIndicator view={surfaceView(q.data.effective.webUi)} />,
              },
              {
                label: "REST API",
                value: <StatusIndicator view={surfaceView(q.data.effective.restApi)} />,
              },
              {
                label: "Agent",
                value: (
                  <StatusIndicator
                    view={{
                      word: q.data.phase,
                      dot: q.data.phase === "Ready" ? "green" : "amber",
                    }}
                  />
                ),
              },
            ]}
          />
          <OpenButton
            teamId={teamId}
            record={q.data}
            suspended={team.data?.state === "suspended"}
          />{" "}
          <Link to={`/t/${teamId}/collaboration`}>Manage collaboration</Link>
        </>
      )}
    </Card>
  );
}

function OpenButton({
  teamId,
  record,
  suspended,
}: {
  teamId: string;
  record: CollaborationRecord;
  suspended: boolean;
}) {
  const me = useMe();
  const s = openPaperclipState({
    hostname: record.hostname,
    effectiveWebUi: record.effective.webUi,
    reasons: record.effective.reasons,
    teamState: suspended ? "suspended" : undefined,
    phase: record.phase,
    canAccess: can(me, "collaboration:access", teamId),
  });
  return (
    <LinkButton href={record.webUiUrl} {...(s.reason ? { disabledReason: s.reason } : {})}>
      Open Paperclip
    </LinkButton>
  );
}
