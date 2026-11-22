import { type Mock, vi } from "vitest";
import type {
  CollaborationPort,
  CollaborationRecord,
  LinkRecord,
} from "../../application/ports/collaboration.js";
import { CollaborationUseCases } from "../../application/usecases/collaboration/CollaborationUseCases.js";

export const aCollaboration = (over: Partial<CollaborationRecord> = {}): CollaborationRecord => ({
  teamId: "team_1",
  agentId: "agt_collab",
  version: 3,
  generation: 4,
  hostname: "alpha.collab.example.test",
  webUiEnabled: true,
  restApiEnabled: false,
  webUiUrl: "https://alpha.collab.example.test/",
  restApiUrl: null,
  registrationMode: "manual",
  effective: { webUi: true, restApi: false, reasons: [] },
  phase: "Ready",
  observedGeneration: 4,
  conditions: [
    { type: "EndpointReady", status: "True" },
    { type: "PaperclipReady", status: "True" },
    { type: "RegistrationHealthy", status: "True" },
    { type: "UnmanagedPaperclipAgents", status: "False" },
  ],
  unmanagedPaperclipAgents: [],
  ...over,
});

export const aLink = (over: Partial<LinkRecord> = {}): LinkRecord => ({
  agentId: "agt_1",
  agentName: "reviewer-bot",
  connect: true,
  linkState: "linked",
  lastSyncedAt: "2026-11-22T10:00:00Z",
  version: 1,
  ...over,
});

export type FakeCollaborationPort = { [K in keyof CollaborationPort]: Mock<CollaborationPort[K]> };

export function fakeCollaborationPort(
  over: Partial<CollaborationPort> = {},
): FakeCollaborationPort {
  return {
    get: vi.fn(async () => aCollaboration()),
    put: vi.fn(async (_t, _r, i) =>
      aCollaboration({
        version: 4,
        webUiEnabled: i.webUiEnabled,
        restApiEnabled: i.restApiEnabled,
      }),
    ),
    listLinks: vi.fn(async () => ({
      items: [
        aLink(),
        aLink({
          agentId: "agt_2",
          agentName: "incident-scribe",
          connect: false,
          linkState: "disabled",
        }),
      ],
    })),
    connect: vi.fn(async (_t, a) => aLink({ agentId: a })),
    disconnect: vi.fn(async (_t, a) =>
      aLink({ agentId: a, connect: false, linkState: "disabled" }),
    ),
    rotateKeys: vi.fn(async () => ({
      rotated: [{ name: "paperclip-better-auth-secret", versionId: "v2" }],
      signsOutEveryone: true,
      agentRolloutPending: true,
    })),
    listManagedSecrets: vi.fn(async (_t, by) => ({
      items: [
        {
          id: `sec_${by}`,
          name: by === "afs" ? "paperclip-tool-action-signing-secret" : "paperclip-agent-key",
          managedBy: by,
          agentId: "agt_collab",
          lastChangedAt: "2026-11-20T10:00:00Z",
        },
        { id: `sec_other_${by}`, name: "elsewhere", managedBy: by, agentId: "agt_other" },
      ],
      more: false,
    })),
    recentAccess: vi.fn(async () => ({
      signIns: 5,
      uniquePeople: 2,
      deniedRequests: 1,
      rows: [
        { principal: { id: "usr_1", name: "Ada" }, signIns: 2, requests: 10, deniedRequests: 0 },
        {
          principal: { id: "usr_1", name: "Ada" },
          signIns: 1,
          requests: 5,
          deniedRequests: 1,
          serviceAdminEntry: true,
        },
        {
          principal: { id: "key_1", type: "api_key", name: "ci" },
          signIns: 0,
          requests: 3,
          deniedRequests: 0,
        },
      ],
    })),
    listEndpoints: vi.fn(async () => ({ items: [] })),
    endpointsCsv: vi.fn(async () => "team,hostname\n"),
    ...over,
  } as unknown as FakeCollaborationPort;
}

export const collaborationServices = (p: CollaborationPort) => ({
  collaboration: new CollaborationUseCases(p),
});
