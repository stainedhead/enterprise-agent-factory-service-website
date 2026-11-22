import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";
import {
  connectAgentCli,
  disconnectAgentCli,
  putCollaborationCli,
  rotateKeysCli,
} from "./collaborationCli.js";

describe("collaboration CLI commands (WEB-6)", () => {
  it("put-collaboration uses the boolean flag pair and adds the mode only when changed", () => {
    expect(
      renderCli(putCollaborationCli("team_1", { webUiEnabled: true, restApiEnabled: false })),
    ).toBe(
      "afs collaboration put-collaboration --team-id team_1 --web-ui-enabled --no-rest-api-enabled",
    );
    expect(
      renderCli(
        putCollaborationCli("team_1", {
          webUiEnabled: false,
          restApiEnabled: true,
          registrationMode: "managed",
        }),
      ),
    ).toBe(
      "afs collaboration put-collaboration --team-id team_1 --no-web-ui-enabled --rest-api-enabled --registration-mode managed",
    );
  });
  it("connect, disconnect and rotate", () => {
    expect(renderCli(connectAgentCli("t", "a", "ag_1"))).toBe(
      "afs collaboration connect-agent --team-id t --agent-id a --paperclip-agent-id ag_1",
    );
    expect(renderCli(connectAgentCli("t", "a"))).toBe(
      "afs collaboration connect-agent --team-id t --agent-id a",
    );
    expect(renderCli(disconnectAgentCli("t", "a"))).toBe(
      "afs collaboration disconnect-agent --team-id t --agent-id a",
    );
    expect(renderCli(rotateKeysCli("t", ["paperclip-better-auth-secret"]))).toBe(
      "afs collaboration rotate-collaboration-keys --team-id t --names paperclip-better-auth-secret",
    );
  });
});
