import { Link } from "react-router";
import type { CollaborationRecord } from "../../../application/ports/collaboration.js";
import { Alert } from "../../components/index.js";

/** Alerts that need a person (WEB-US-50): open sign-up, an unhealthy registration, agents AFS does not manage. */
export function ConditionAlerts({ record }: { record: CollaborationRecord }) {
  const cond = (t: string) => record.conditions.find((c) => c.type === t);
  const ready = cond("PaperclipReady");
  const reg = cond("RegistrationHealthy");
  const unmanaged = cond("UnmanagedPaperclipAgents");
  return (
    <>
      {ready?.status === "False" && ready.reason === "OpenSignUp" && (
        <Alert kind="warning" title="Paperclip sign-up is open">
          Paperclip sign-up is open. Close it in Paperclip's settings.
        </Alert>
      )}
      {reg?.status === "False" && (
        <Alert kind="warning" title="Registration is not healthy">
          {reg.message ?? reg.reason ?? "Registration is not healthy"}
        </Alert>
      )}
      {(record.unmanagedPaperclipAgents.length > 0 || unmanaged?.status === "True") && (
        <Alert kind="warning" title="Paperclip has agents AFS does not manage">
          Paperclip has agents AFS does not manage: {record.unmanagedPaperclipAgents.join(", ")}.
          Each Paperclip agent must be an AFS agent with its own pod, or be removed in Paperclip.
        </Alert>
      )}
    </>
  );
}

/** How access works, how to register agents and the first-admin bootstrap by mode, and the trust preset advice. */
export function GuidancePanel({ teamId, record }: { teamId: string; record: CollaborationRecord }) {
  const managed = record.registrationMode === "managed";
  return (
    <section aria-label="Guidance">
      <h2>Guidance</h2>
      <h3>How access works</h3>
      <p>
        An AFS role decides on every request. Viewers read; collaborators and team-admins write.
        People may also be asked to sign in to Paperclip.
      </p>
      <h3>{managed ? "Managed registration" : "Manual registration"}</h3>
      {managed ? (
        <p>
          AFS emails the first admin invite directly to the team-admin who created the collaboration
          agent.
        </p>
      ) : (
        <>
          <p>
            Create the agent in Paperclip, record its id with Connect, and store its key as a secret
            named paperclip-agent-api-key on that agent.
          </p>
          <p>
            The first Paperclip admin invite is written to the collaboration agent's log.{" "}
            <Link to={`/t/${teamId}/agents/${record.agentId}?tab=logs`}>Open agent logs</Link>
          </p>
        </>
      )}
      <h3>Projects with external content</h3>
      <p>
        Paperclip's low_trust_review trust preset is recommended for projects that ingest external
        content such as synced Jira and GitHub items and untrusted pull requests. AFS does not set
        it.
      </p>
    </section>
  );
}
