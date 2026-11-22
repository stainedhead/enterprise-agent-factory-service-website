import type { ReactNode } from "react";
import { Alert } from "../components/Alert.js";
import { useTeamWriteGate } from "../hooks/useTeamWriteGate.js";

/**
 * Wraps every page of a team (`/t/:teamId/...`): while the team is suspended each page shows the banner
 * (TEAM-9). The controls disable themselves through `useTeamWriteGate`.
 */
export function TeamLayout({ teamId, children }: { teamId: string; children: ReactNode }) {
  const { suspended } = useTeamWriteGate(teamId);
  return (
    <>
      {suspended && (
        <Alert kind="warning" title="Team is suspended">
          Agents are stopped and changes are blocked until a team admin resumes the team.
        </Alert>
      )}
      {children}
    </>
  );
}
