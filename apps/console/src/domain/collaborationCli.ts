// The `afs collaboration ...` commands shown beside the collaboration forms (WEB-6). Boolean flags follow the
// AWS CLI pair (`--x` or `--no-x`, OQ-WP7). Nothing here can carry a secret or a Paperclip key.
import { boolFlag, buildCli, type CliCommand } from "./cli.js";

/** `afs collaboration put-collaboration`; the registration mode is added only when it is part of the change. */
export function putCollaborationCli(
  teamId: string,
  v: { webUiEnabled: boolean; restApiEnabled: boolean; registrationMode?: string | undefined },
): CliCommand {
  const base = buildCli("PutTeamCollaboration", { teamId });
  return {
    ...base,
    args: [
      ["team-id", teamId],
      boolFlag("web-ui-enabled", v.webUiEnabled),
      boolFlag("rest-api-enabled", v.restApiEnabled),
      ["registration-mode", v.registrationMode],
    ],
  };
}

export const connectAgentCli = (teamId: string, agentId: string, paperclipAgentId?: string) =>
  buildCli("ConnectAgentToCollaboration", {
    teamId,
    agentId,
    ...(paperclipAgentId ? { paperclipAgentId } : {}),
  });

export const disconnectAgentCli = (teamId: string, agentId: string) =>
  buildCli("DisconnectAgentFromCollaboration", { teamId, agentId });

export const rotateKeysCli = (teamId: string, names: readonly string[]) =>
  buildCli("RotateCollaborationKeys", { teamId, names: [...names] });
