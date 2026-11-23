import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors.js";
import type { OrchestrationPort, OrchestrationRecord } from "../../ports/orchestration.js";
import { AGENT_PENDING, isAgentPending, OrchestrationUseCases } from "./OrchestrationUseCases.js";

const surface = (over = {}) => ({
  supported: true,
  exposure: "off",
  effective: "off",
  reasons: [],
  hostname: null,
  url: null,
  ...over,
});
const anOrchestration = (over: Partial<OrchestrationRecord> = {}): OrchestrationRecord => ({
  teamId: "team_1",
  agentId: "agt_o",
  agentName: "orchestrator",
  phase: "Ready",
  tool: "paperclip",
  toolVersion: "1.0",
  registrationMode: "manual",
  limit: "private",
  webUi: surface(),
  webApi: surface(),
  connectedAgents: 0,
  unmanagedToolAgents: [],
  version: 3,
  generation: 4,
  observedGeneration: 4,
  conditions: [],
  ...over,
});
const make = () => {
  const port = {
    get: vi.fn(async () => anOrchestration()),
    put: vi.fn(async () => anOrchestration()),
    changeTool: vi.fn(async () => anOrchestration({ tool: "buzz" })),
    listEndpoints: vi.fn(async () => ({ items: [] })),
    endpointsCsv: vi.fn(async () => "team,hostname\n"),
  } as unknown as OrchestrationPort & Record<string, ReturnType<typeof vi.fn>>;
  return { port, uc: new OrchestrationUseCases(port) };
};
const fields = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as AppError).fields;

describe("OrchestrationUseCases", () => {
  it("recognises the pending answer of a team the backfill has not reached", () => {
    expect(
      isAgentPending(new AppError({ kind: "not-found", message: "x", reason: AGENT_PENDING })),
    ).toBe(true);
    expect(isAgentPending(new AppError({ kind: "not-found", message: "x" }))).toBe(false);
    expect(isAgentPending(new Error("x"))).toBe(false);
  });
  it("put sends both surfaces with the version read", async () => {
    const { port, uc } = make();
    await uc.put("team_1", anOrchestration(), { webUi: "private", webApi: "off" });
    expect(port.put).toHaveBeenCalledWith(
      "team_1",
      { version: 3 },
      { webUi: "private", webApi: "off" },
    );
  });
  it("put refuses a level above the limit and a surface the tool lacks, without calling the API", async () => {
    const { port, uc } = make();
    expect(
      await fields(uc.put("team_1", anOrchestration(), { webUi: "public", webApi: "off" })),
    ).toEqual({
      "webUi.exposure": "exposure_above_limit",
    });
    const buzz = anOrchestration({ webUi: surface({ supported: false }) });
    expect(await fields(uc.put("team_1", buzz, { webUi: "private", webApi: "off" }))).toEqual({
      "webUi.exposure": "surface_not_supported_by_tool",
    });
    expect(
      await fields(uc.put("team_1", anOrchestration(), { webUi: "bogus", webApi: "off" })),
    ).toHaveProperty("webUi.exposure");
    expect(port.put).not.toHaveBeenCalled();
  });
  it("changeTool needs the typed slug and a different tool", async () => {
    const { port, uc } = make();
    expect(
      await fields(uc.changeTool("team_1", { tool: "paperclip" }, "buzz", "nope", "alpha")),
    ).toHaveProperty("confirm");
    const same = (await uc
      .changeTool("team_1", { tool: "paperclip" }, "paperclip", "alpha", "alpha")
      .catch((e) => e)) as AppError;
    expect(same.reason).toBe("tool_unchanged");
    expect(port.changeTool).not.toHaveBeenCalled();
    await uc.changeTool("team_1", { tool: "paperclip" }, "buzz", " alpha ", "alpha");
    expect(port.changeTool).toHaveBeenCalledWith("team_1", "buzz");
  });
  it("get, endpoints and csv pass through", async () => {
    const { port, uc } = make();
    await uc.get("team_1");
    await uc.listEndpoints({});
    expect(await uc.endpointsCsv({})).toContain("team");
    expect(port.get).toHaveBeenCalled();
    expect(port.listEndpoints).toHaveBeenCalled();
  });
});
