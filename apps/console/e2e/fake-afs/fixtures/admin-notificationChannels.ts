import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
/** The service channel work orders name: deleting it is a `409` (disable it instead). */
export const WORK_ORDER_CHANNEL = `nch_${NS}0901`;
const ok = { conditions: [], observedGeneration: 1, phase: "Ready", updatedAt: ts };

const seed = (): Json[] => [
  {
    id: WORK_ORDER_CHANNEL,
    name: "work-order-alerts",
    kind: "email",
    enabled: true,
    eventTypes: ["workorder.*"],
    config: { to: "platform-ops@example.test" },
    delivery: { healthy: true, lastDeliveredAt: "2026-11-21T09:30:00Z" },
    status: ok,
    generation: 1,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
  {
    id: `nch_${NS}0902`,
    name: "platform-slack",
    kind: "slack",
    enabled: true,
    eventTypes: ["budget.*"],
    config: { channel: "#afs-platform" },
    secretId: `sec_${NS}0001`,
    delivery: { healthy: false, lastFailureAt: "2026-11-21T12:00:00Z", lastError: "invalid_auth" },
    status: ok,
    generation: 1,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
];

let channels: Json[] = [];
export const resetAdminNotificationChannels = (): void => {
  channels = seed();
};
resetAdminNotificationChannels();

const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Channel not found", requestId: "req_fake_nf" },
};

/** Service notification channels (M4-N): stateful; deleting the one named by work orders is a `409`. */
export const adminNotificationChannelsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/notification-channels",
    response: () => ({ status: 200, body: { items: channels } }),
  },
  {
    method: "POST",
    path: "/v1/admin/notification-channels",
    response: ({ body }) => {
      const n: Json = {
        enabled: true,
        delivery: {},
        status: ok,
        generation: 1,
        createdAt: ts,
        updatedAt: ts,
        ...(body as Json),
        id: `nch_${NS}${String(910 + channels.length).padStart(4, "0")}`,
        version: 1,
      };
      channels.push(n);
      return { status: 201, body: n };
    },
  },
  {
    method: "PATCH",
    path: "/v1/admin/notification-channels/{id}",
    response: ({ params, body }) => {
      const i = channels.findIndex((c) => c.id === params.id);
      if (i < 0) return notFound;
      const next = { ...channels[i], ...(body as Json), version: Number(channels[i]?.version) + 1 };
      channels[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/notification-channels/{id}",
    response: ({ params }) => {
      const c = channels.find((x) => x.id === params.id);
      if (!c) return notFound;
      if (c.id === WORK_ORDER_CHANNEL && c.enabled !== false)
        return {
          status: 409,
          body: {
            code: "Conflict",
            message: "work_orders.notification_channel_id names this channel",
            requestId: "req_fake_409",
            details: { workOrders: ["wo_01JD2Q3R4S5T6V7W8X9Y0Z0001"] },
          },
        };
      channels = channels.filter((x) => x.id !== params.id);
      return { status: 204 };
    },
  },
];
