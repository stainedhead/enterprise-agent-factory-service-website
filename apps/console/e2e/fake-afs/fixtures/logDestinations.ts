import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
export const LOG_IDS = [`log_${NS}0001`, `log_${NS}0002`] as const;

const status = (phase: string, deliveryOk?: boolean, message?: string): Json => ({
  conditions:
    deliveryOk === undefined
      ? []
      : [
          {
            type: "DeliveryHealthy",
            status: deliveryOk ? "True" : "False",
            lastTransitionTime: "2026-11-21T19:00:00Z",
            ...(message && { message }),
          },
        ],
  observedGeneration: 1,
  phase,
  updatedAt: ts,
});

const seed = (): Json[] => [
  {
    id: LOG_IDS[0],
    name: "central-cloudwatch",
    kind: "cloudwatch",
    enabled: true,
    config: { logGroup: "/afs/payments", region: "eu-west-1" },
    generation: 1,
    status: status("Ready", true),
    version: 1,
  },
  {
    id: LOG_IDS[1],
    name: "audit-splunk",
    kind: "splunk_hec",
    enabled: true,
    config: { endpoint: "https://hec.example.test" },
    secretId: `sec_${NS}0001`,
    generation: 1,
    status: status("Degraded", false, "HTTP 403 from the HEC endpoint"),
    version: 1,
  },
];

let dests = new Map<string, Json[]>();
export const resetLogDestinations = (): void => {
  dests = new Map(TEAMS.map((t) => [t.id, seed()]));
};
resetLogDestinations();

const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Log destination not found", requestId: "req_fake_nf" },
};

/** Log destinations per team (M4-L): stateful list, create, update and delete. */
export const logDestinationsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/log-destinations",
    response: ({ params }) =>
      dests.has(params.teamId ?? "")
        ? { status: 200, body: { items: dests.get(params.teamId ?? "") } }
        : notFound,
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/log-destinations",
    response: ({ params, body }) => {
      const list = dests.get(params.teamId ?? "");
      if (!list) return notFound;
      const n: Json = {
        enabled: true,
        createdAt: ts,
        createdBy: "usr_team-admin",
        generation: 1,
        status: status("Pending"),
        updatedAt: ts,
        ...(body as Json),
        id: `log_${NS}${String(100 + list.length).padStart(4, "0")}`,
        version: 1,
      };
      list.push(n);
      return { status: 201, body: n };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/log-destinations/{id}",
    response: ({ params }) => {
      const d = dests.get(params.teamId ?? "")?.find((x) => x.id === params.id);
      return d ? { status: 200, body: d } : notFound;
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/log-destinations/{id}",
    response: ({ params, body }) => {
      const list = dests.get(params.teamId ?? "");
      const i = list?.findIndex((x) => x.id === params.id) ?? -1;
      if (!list || i < 0) return notFound;
      const next = { ...list[i], ...(body as Json), version: Number(list[i]?.version) + 1 };
      list[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/log-destinations/{id}",
    response: ({ params }) => {
      const list = dests.get(params.teamId ?? "");
      const d = list?.find((x) => x.id === params.id);
      if (!list || !d) return notFound;
      dests.set(
        params.teamId ?? "",
        list.filter((x) => x.id !== params.id),
      );
      return { status: 202, body: d };
    },
  },
];
