import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { isAppError } from "../../../../application/errors.js";
import type { OrchestrationRecord } from "../../../../application/ports/orchestration.js";
import { isAgentPending } from "../../../../application/usecases/orchestration/OrchestrationUseCases.js";
import { can } from "../../../../domain/me.js";
import {
  exposureLabel,
  exposureView,
  notApplicableText,
  openToolState,
  safeWebUrl,
  toolLabel,
} from "../../../../domain/orchestration.js";
import {
  OrchestrationCard as AccentCard,
  Alert,
  KeyValue,
  LinkButton,
  OrchestrationMark,
  StatusIndicator,
} from "../../../components/index.js";
import { teamKey } from "../../../hooks/useTeamWriteGate.js";
import { useOptionalService } from "../../../services.js";
import { useMe } from "../../../shell/ShellContext.js";
import { orchKey } from "../../t17-orchestration/keys.js";

/**
 * The *Orchestration* card on T1 and V1 (WEB-US-53, ORC-21): the tool, the two surfaces, the agent phase and *Open
 * <tool>*. It has its own error and its own empty state: a team the backfill has not reached shows "Orchestration
 * agent being created".
 */
export function OrchestrationCard({ teamId }: { teamId: string }) {
  const me = useMe();
  const orch = useOptionalService("orchestration");
  const teams = useOptionalService("teams");
  const q = useQuery({
    queryKey: orchKey(teamId),
    queryFn: ({ signal }) =>
      orch ? orch.get(teamId, signal) : Promise.reject(new Error("no orchestration service")),
    enabled: orch !== undefined,
    retry: false,
  });
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) =>
      teams ? teams.get(teamId, signal) : Promise.reject(new Error("no teams service")),
    enabled: teams !== undefined,
  });
  const r = q.data;
  return (
    <AccentCard label="Orchestration">
      <h2>
        <OrchestrationMark /> Orchestration
      </h2>
      {q.isPending && <p role="status">Loading orchestration…</p>}
      {isAgentPending(q.error) && <p>Orchestration agent being created.</p>}
      {q.isError && !isAgentPending(q.error) && (
        <Alert kind="error" title="Orchestration could not be loaded">
          {isAppError(q.error) ? q.error.message : "The request failed"}
        </Alert>
      )}
      {r && (
        <>
          <KeyValue
            items={[
              { label: "Tool", value: toolLabel(r.tool) },
              {
                label: "Web UI",
                value: r.webUi.supported ? (
                  <StatusIndicator view={exposureView(r.webUi.effective)} />
                ) : (
                  notApplicableText(r.tool, "webUi")
                ),
              },
              {
                label: "Web API",
                value: r.webApi.supported ? (
                  <StatusIndicator view={exposureView(r.webApi.effective)} />
                ) : (
                  notApplicableText(r.tool, "webApi")
                ),
              },
              { label: "Endpoint limit", value: exposureLabel(r.limit) },
              {
                label: "Agent",
                value: (
                  <StatusIndicator
                    view={{ word: r.phase, dot: r.phase === "Ready" ? "green" : "amber" }}
                  />
                ),
              },
            ]}
          />
          <OpenButton
            teamId={teamId}
            record={r}
            suspended={team.data?.state === "suspended"}
            canAccess={can(me, "collaboration:access", teamId)}
          />{" "}
          <Link to={`/t/${teamId}/orchestration`}>Manage orchestration</Link>
        </>
      )}
    </AccentCard>
  );
}

function OpenButton({
  record,
  suspended,
  canAccess,
}: {
  teamId: string;
  record: OrchestrationRecord;
  suspended: boolean;
  canAccess: boolean;
}) {
  const s = openToolState({
    tool: record.tool,
    supported: record.webUi.supported,
    hostname: record.webUi.hostname,
    effective: record.webUi.effective,
    reasons: record.webUi.reasons,
    teamState: suspended ? "suspended" : undefined,
    phase: record.phase,
    canAccess,
  });
  return (
    <LinkButton
      href={safeWebUrl(record.webUi.url)}
      {...(s.reason ? { disabledReason: s.reason } : {})}
    >
      Open {toolLabel(record.tool)}
    </LinkButton>
  );
}
