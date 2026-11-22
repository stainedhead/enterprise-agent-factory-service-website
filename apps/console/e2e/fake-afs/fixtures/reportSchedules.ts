import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";
import { CHANNEL_IDS } from "./notifications.js";

type Json = Record<string, unknown>;

const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const ts = "2026-11-21T18:00:00Z";

const seed = (): Json[] => [
  {
    id: `rs_${NS}0001`,
    name: "Weekly spend",
    channelId: CHANNEL_IDS[0],
    cadence: "weekly",
    enabled: true,
    format: "csv",
    report: "costs",
    query: { range: "7d", groupBy: ["day"] },
    nextRunAt: "2026-11-29T06:00:00Z",
    lastRunAt: "2026-11-22T06:00:00Z",
    lastStatus: "succeeded",
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
  {
    id: `rs_${NS}0002`,
    name: "Agent activity",
    channelId: CHANNEL_IDS[1],
    cadence: "daily",
    enabled: true,
    format: "csv",
    report: "activity",
    query: { range: "24h" },
    nextRunAt: "2026-11-23T06:00:00Z",
    lastRunAt: "2026-11-22T06:00:00Z",
    lastStatus: "failed",
    lastError: "HTTP 401 from the webhook",
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
];

let schedules = new Map<string, Json[]>();
export const resetReportSchedules = (): void => {
  schedules = new Map(TEAMS.map((t) => [t.id, seed()]));
};
resetReportSchedules();

const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Schedule not found", requestId: "req_fake_nf" },
};

/** Report schedules per team (M4-S): stateful; a channel the team does not own is a ValidationError on `channelId`. */
export const reportSchedulesFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/report-schedules",
    response: ({ params }) =>
      schedules.has(params.teamId ?? "")
        ? { status: 200, body: { items: schedules.get(params.teamId ?? "") } }
        : notFound,
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/report-schedules",
    response: ({ params, body }) => {
      const list = schedules.get(params.teamId ?? "");
      if (!list) return notFound;
      const b = body as Json;
      if (!(CHANNEL_IDS as readonly string[]).includes(String(b.channelId)))
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "Use one of the team's own channels",
            requestId: "req_fake_val",
            details: {
              fields: [
                {
                  field: "channelId",
                  message: "Use one of the team's own channels",
                  reason: "invalid",
                },
              ],
            },
          },
        };
      const n: Json = {
        enabled: true,
        format: "csv",
        query: {},
        nextRunAt: "2026-11-29T06:00:00Z",
        createdAt: ts,
        updatedAt: ts,
        ...b,
        id: `rs_${NS}${String(100 + list.length).padStart(4, "0")}`,
        version: 1,
      };
      list.push(n);
      return { status: 201, body: n };
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/report-schedules/{scheduleId}",
    response: ({ params, body }) => {
      const list = schedules.get(params.teamId ?? "");
      const i = list?.findIndex((x) => x.id === params.scheduleId) ?? -1;
      if (!list || i < 0) return notFound;
      const next = { ...list[i], ...(body as Json), version: Number(list[i]?.version) + 1 };
      list[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/report-schedules/{scheduleId}",
    response: ({ params }) => {
      const list = schedules.get(params.teamId ?? "");
      if (!list?.some((x) => x.id === params.scheduleId)) return notFound;
      schedules.set(
        params.teamId ?? "",
        list.filter((x) => x.id !== params.scheduleId),
      );
      return { status: 204 };
    },
  },
];
