import { Link } from "react-router";
import type { AgentRole } from "../../../../application/ports/agents.js";
import { Card, FormField } from "../../../components/index.js";

/**
 * *Role* (WEB-US-45): a worker (default) or the team's one collaboration agent (Paperclip). The role is set at
 * create and never changes. The collaboration choice is disabled when the team already has one.
 */
export function RoleSection({
  teamId,
  role,
  onRole,
  existingId,
  racedExisting,
}: {
  teamId: string;
  role: AgentRole;
  onRole: (r: AgentRole) => void;
  existingId: string | undefined;
  racedExisting: boolean;
}) {
  const taken = existingId !== undefined || racedExisting;
  return (
    <Card title="Role">
      <FormField label="Role">
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Role</legend>
          <label>
            <input
              type="radio"
              name="agent-role"
              checked={role === "worker"}
              onChange={() => onRole("worker")}
            />{" "}
            Worker
          </label>{" "}
          <label>
            <input
              type="radio"
              name="agent-role"
              checked={role === "collaboration"}
              aria-disabled={taken || undefined}
              aria-describedby={taken ? "role-taken" : undefined}
              onChange={() => {
                if (!taken) onRole("collaboration");
              }}
            />{" "}
            Collaboration (Paperclip)
          </label>
        </fieldset>
      </FormField>
      {taken && (
        <p id="role-taken">
          This team already has a collaboration agent.{" "}
          {existingId && <Link to={`/t/${teamId}/agents/${existingId}`}>Open it</Link>}
        </p>
      )}
      {role === "collaboration" && (
        <p>
          Paperclip's data lives on this agent's volume. AFS generates and stores Paperclip's boot
          secrets; you never see them.
        </p>
      )}
    </Card>
  );
}
