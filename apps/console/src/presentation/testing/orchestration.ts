import { type Mock, vi } from "vitest";
import type {
  OrchestrationPort,
  OrchestrationRecord,
  SurfaceRecord,
} from "../../application/ports/orchestration.js";
import { OrchestrationUseCases } from "../../application/usecases/orchestration/OrchestrationUseCases.js";

export const aSurface = (over: Partial<SurfaceRecord> = {}): SurfaceRecord => ({
  supported: true,
  exposure: "off",
  effective: "off",
  reasons: [],
  hostname: null,
  url: null,
  ...over,
});

/** A Ready Paperclip orchestration with the Web UI Private and the Web API Off, limit Private. */
export const anOrchestration = (over: Partial<OrchestrationRecord> = {}): OrchestrationRecord => ({
  teamId: "team_1",
  agentId: "agt_orch",
  agentName: "orchestrator",
  phase: "Ready",
  tool: "paperclip",
  toolVersion: "1.4",
  registrationMode: "manual",
  limit: "private",
  webUi: aSurface({
    exposure: "private",
    effective: "private",
    hostname: "alpha.collab.example.test",
    url: "https://alpha.collab.example.test/",
  }),
  webApi: aSurface(),
  connectedAgents: 1,
  unmanagedToolAgents: [],
  version: 3,
  generation: 4,
  observedGeneration: 4,
  conditions: [
    { type: "EndpointReady", status: "True" },
    { type: "ToolReady", status: "True" },
    { type: "RegistrationHealthy", status: "True" },
    { type: "UnmanagedToolAgents", status: "False" },
  ],
  ...over,
});

/** A Buzz orchestration: both surfaces are N/A and Off. */
export const aBuzzOrchestration = (over: Partial<OrchestrationRecord> = {}): OrchestrationRecord =>
  anOrchestration({
    tool: "buzz",
    webUi: aSurface({ supported: false }),
    webApi: aSurface({ supported: false }),
    ...over,
  });

export type FakeOrchestrationPort = { [K in keyof OrchestrationPort]: Mock<OrchestrationPort[K]> };

export function fakeOrchestrationPort(
  over: Partial<OrchestrationPort> = {},
): FakeOrchestrationPort {
  return {
    get: vi.fn(async () => anOrchestration()),
    put: vi.fn(async (_t, r, i) =>
      anOrchestration({
        version: r.version + 1,
        webUi: aSurface({ exposure: i.webUi, effective: i.webUi }),
        webApi: aSurface({ exposure: i.webApi, effective: i.webApi }),
      }),
    ),
    changeTool: vi.fn(async (_t, tool) => anOrchestration({ tool, version: 4 })),
    listEndpoints: vi.fn(async () => ({ items: [] })),
    endpointsCsv: vi.fn(async () => "team,hostname\n"),
    ...over,
  } as unknown as FakeOrchestrationPort;
}

export const orchestrationServices = (p: OrchestrationPort) => ({
  orchestration: new OrchestrationUseCases(p),
});
