import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const SEC = `sec_${NS}0001`;
export const CHANNEL_IDS = [`nch_${NS}0001`, `nch_${NS}0002`, `nch_${NS}0003`] as const;
const ok = { conditions: [], observedGeneration: 1, phase: "Ready", updatedAt: ts };

const seed = (): Json[] => [
  {
    id: CHANNEL_IDS[0],
    name: "ops-slack",
    kind: "slack",
    enabled: true,
    eventTypes: ["budget.*", "agent.failed"],
    config: { channel: "#agent-ops" },
    secretId: SEC,
    delivery: { healthy: true, lastDeliveredAt: "2026-11-21T09:30:00Z" },
    status: ok,
    createdAt: ts,
    createdBy: "usr_team-admin",
    generation: 1,
    updatedAt: ts,
    version: 1,
  },
  {
    id: CHANNEL_IDS[1],
    name: "billing-webhook",
    kind: "webhook",
    enabled: true,
    eventTypes: ["budget.*"],
    config: { url: "https://hooks.example.test/billing" },
    secretId: SEC,
    delivery: {
      healthy: false,
      lastFailureAt: "2026-11-21T12:00:00Z",
      lastError: "HTTP 401 from the webhook",
    },
    status: ok,
    createdAt: ts,
    createdBy: "usr_team-admin",
    generation: 1,
    updatedAt: ts,
    version: 1,
  },
  {
    id: CHANNEL_IDS[2],
    name: "pager",
    kind: "jira",
    enabled: true,
    eventTypes: ["agent.failed"],
    config: { site: "example.atlassian.net", project: "OPS" },
    secretId: SEC,
    delivery: { healthy: null },
    status: ok,
    createdAt: ts,
    createdBy: "usr_team-admin",
    generation: 1,
    updatedAt: ts,
    version: 1,
  },
];

let channels = new Map<string, Json[]>();
export const resetNotifications = (): void => {
  channels = new Map(TEAMS.map((t) => [t.id, seed()]));
};
resetNotifications();

const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Channel not found", requestId: "req_fake_nf" },
};
const find = (teamId: string, id: string) => channels.get(teamId)?.find((c) => c.id === id);

/** Notification channels per team, the test action (200 and 202 pending) and one report schedule (M3-N). */
export const notificationsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/notification-channels",
    response: ({ params }) =>
      channels.has(params.teamId ?? "")
        ? { status: 200, body: { items: channels.get(params.teamId ?? "") } }
        : notFound,
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/notification-channels",
    response: ({ params, body }) => {
      const list = channels.get(params.teamId ?? "");
      if (!list) return notFound;
      const n: Json = {
        enabled: true,
        delivery: {},
        status: ok,
        createdAt: ts,
        createdBy: "usr_team-admin",
        generation: 1,
        updatedAt: ts,
        ...(body as Json),
        id: `nch_${NS}${String(100 + list.length).padStart(4, "0")}`,
        version: 1,
      };
      list.push(n);
      return { status: 201, body: n };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/notification-channels/{id}",
    response: ({ params }) => {
      const c = find(params.teamId ?? "", params.id ?? "");
      return c ? { status: 200, body: c } : notFound;
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/notification-channels/{id}",
    response: ({ params, body }) => {
      const list = channels.get(params.teamId ?? "");
      const i = list?.findIndex((c) => c.id === params.id) ?? -1;
      if (!list || i < 0) return notFound;
      const next = { ...list[i], ...(body as Json), version: Number(list[i]?.version) + 1 };
      list[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/notification-channels/{id}",
    response: ({ params }) => {
      const list = channels.get(params.teamId ?? "");
      const c = find(params.teamId ?? "", params.id ?? "");
      if (!list || !c) return notFound;
      channels.set(
        params.teamId ?? "",
        list.filter((x) => x.id !== params.id),
      );
      return { status: 202, body: c };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/notification-channels/{id}:test",
    response: ({ params }) => {
      const c = find(params.teamId ?? "", params.id ?? "");
      if (!c) return notFound;
      if (c.id === CHANNEL_IDS[1])
        return {
          status: 200,
          body: { testId: "test_1", delivered: false, error: "HTTP 401 from the webhook" },
        };
      if (c.id === CHANNEL_IDS[2]) {
        // reported on the next read of the channel (CD-3)
        c.delivery = { healthy: true, lastDeliveredAt: ts, lastTestId: "test_2" };
        return { status: 202, body: { testId: "test_2", pending: true } };
      }
      return { status: 200, body: { testId: "test_0", delivered: true } };
    },
  },
];
