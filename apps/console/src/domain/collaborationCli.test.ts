import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";
import { connectAgentCli, disconnectAgentCli, rotateKeysCli } from "./collaborationCli.js";

describe("collaboration CLI commands (WEB-6)", () => {
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
