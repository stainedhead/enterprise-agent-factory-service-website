import { Link } from "react-router";
import type { OrchestrationRecord } from "../../../application/ports/orchestration.js";
import { toolInfo, toolLabel } from "../../../domain/orchestration.js";
import { Alert } from "../../components/index.js";

/** Alerts that need a person: open sign-up, an unhealthy registration, agents AFS does not manage, a tool change. */
export function ConditionAlerts({ record }: { record: OrchestrationRecord }) {
  const cond = (t: string) => record.conditions.find((c) => c.type === t);
  const ready = cond("ToolReady");
  const reg = cond("RegistrationHealthy");
  const unmanaged = cond("UnmanagedToolAgents");
  const changing = cond("ToolChanging");
  const tool = toolLabel(record.tool);
  return (
    <>
      {changing?.status === "True" && (
        <Alert kind="info" title="The tool is being changed">
          {changing.message ?? `The orchestration agent is switching to ${tool}.`}
        </Alert>
      )}
      {ready?.status === "False" && ready.reason === "OpenSignUp" && (
        <Alert kind="warning" title={`${tool} sign-up is open`}>
          {tool} sign-up is open. Close it in {tool}'s settings.
        </Alert>
      )}
      {reg?.status === "False" && (
        <Alert kind="warning" title="Registration is not healthy">
          {reg.message ?? reg.reason ?? "Registration is not healthy"}
        </Alert>
      )}
      {(record.unmanagedToolAgents.length > 0 || unmanaged?.status === "True") && (
        <Alert kind="warning" title={`${tool} has agents AFS does not manage`}>
          {tool} has agents AFS does not manage: {record.unmanagedToolAgents.join(", ")}. Each agent
          must be an AFS agent with its own pod, or be removed in {tool}.
        </Alert>
      )}
    </>
  );
}

/** How access works, how to register agents and the first-admin bootstrap by mode, and the trust preset advice. */
export function GuidancePanel({ teamId, record }: { teamId: string; record: OrchestrationRecord }) {
  const managed = record.registrationMode === "managed";
  const info = toolInfo(record.tool);
  return (
    <section aria-label="Guidance">
      <h2>Guidance</h2>
      <h3>How access works</h3>
      <p>
        An AFS role decides on every request. Viewers read; collaborators and team-admins write.
        People may also be asked to sign in to {info.label}.
      </p>
      <h3>{managed ? "Managed registration" : "Manual registration"}</h3>
      {managed ? (
        <p>
          AFS emails the first admin invite directly to the team-admin who created the team's
          orchestration agent.
        </p>
      ) : (
        <>
          <p>
            Create the agent in {info.label}, record its id with Connect, and store its key as a
            secret on that agent.
          </p>
          <p>
            The first admin invite is written to the orchestration agent's log.{" "}
            <Link to={`/t/${teamId}/orchestration/logs`}>Open orchestration logs</Link>
          </p>
        </>
      )}
      {record.tool === "paperclip" && (
        <>
          <h3>Projects with external content</h3>
          <p>
            Paperclip's low_trust_review trust preset is recommended for projects that ingest
            external content such as synced Jira and GitHub items and untrusted pull requests. AFS
            does not set it.
          </p>
        </>
      )}
    </section>
  );
}
