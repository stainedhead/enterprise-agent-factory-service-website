// The `afs collaboration ...` commands shown beside the collaboration forms (WEB-6). The exposure commands are in
// `orchestration.ts`. Nothing here can carry a secret or a Paperclip key.
import { buildCli } from "./cli.js";

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
