import type { Fixture, FixtureContext, FixtureResponse } from "./index.js";
import { teamBody } from "./teams.js";

type Json = Record<string, unknown>;
const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
export const extId = (n: number) => `ext_${NS}${String(n).padStart(4, "0")}`;

const sys = (n: number, name: string, category: string, extra: Json = {}): Json => ({
  id: extId(n),
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  category,
  endpoints: [`api.${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example.com`],
  enabled: true,
  builtin: true,
  scope: "service",
  version: 1,
  createdAt: ts,
  ...extra,
});

const seedCatalog = (): Json[] => [
  sys(1, "GitHub", "dev_tools"),
  sys(2, "Slack", "collaboration"),
  sys(3, "Bedrock", "llm"),
  sys(4, "OpenAI API", "llm", { builtin: false, unmetered: true }),
  sys(5, "Jira", "dev_tools", { enabled: false }),
];

interface State {
  catalog: Json[];
  declared: Map<string, Json[]>;
  teamOff: Set<string>;
  agentOff: Set<string>;
  seq: number;
}
const fresh = (): State => ({
  catalog: seedCatalog(),
  declared: new Map(),
  teamOff: new Set(),
  agentOff: new Set(),
  seq: 0,
});
let st = fresh();
export const resetExternalSystems = (): void => {
  st = fresh();
};

/** The service catalog, shared with the S7 admin fixtures. */
export const catalogStore = (): Json[] => st.catalog;
export const nextExtSeq = (): number => ++st.seq;

const declaredOf = (t: string): Json[] => {
  let d = st.declared.get(t);
  if (!d) {
    d = [];
    st.declared.set(t, d);
  }
  return d;
};

const teamView = (t: string, s: Json): Json => {
  const off = st.teamOff.has(`${t}/${s.id}`);
  const disabledAt = s.enabled === false ? "service" : off ? "team" : null;
  return { ...s, teamState: off ? "off" : "on", disabledAt };
};
const agentView = (t: string, a: string, s: Json): Json => {
  const base = teamView(t, s);
  if (base.disabledAt) return base;
  return st.agentOff.has(`${t}/${a}/${s.id}`) ? { ...base, disabledAt: "agent" } : base;
};
const allFor = (t: string): Json[] => [...st.catalog, ...declaredOf(t)];

const notFound: FixtureResponse = {
  status: 404,
  body: { code: "NotFound", message: "System not found", requestId: "req_fake_nf" },
};
const bad = (field: string, message: string): FixtureResponse => ({
  status: 400,
  body: {
    code: "ValidationError",
    message,
    requestId: "req_fake_val",
    details: { fields: [{ field, message, reason: "invalid" }] },
  },
});
const forbidden: FixtureResponse = {
  status: 403,
  body: {
    code: "AccessDenied",
    message: "The team may not declare systems",
    requestId: "req_fake_ad",
    details: { requiredPermission: "teams:set-guardrails" },
  },
};

const findSystem = (c: FixtureContext): Json | undefined =>
  allFor(c.params.teamId ?? "").find((s) => s.id === (c.params.systemId ?? ""));

/** Team and agent external-system switches and team-declared systems (M2-E). */
export const externalSystemsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/external-systems",
    response: ({ params }) => ({
      status: 200,
      body: { items: allFor(params.teamId ?? "").map((s) => teamView(params.teamId ?? "", s)) },
    }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/external-systems",
    response: ({ params, body }) => {
      const t = params.teamId ?? "";
      if (teamBody(t)?.mayAddExternalSystems !== true) return forbidden;
      const b = body as Json;
      const d: Json = {
        id: extId(100 + nextExtSeq()),
        ...b,
        enabled: true,
        builtin: false,
        scope: "team",
        version: 1,
        createdAt: ts,
      };
      declaredOf(t).push(d);
      return { status: 201, body: teamView(t, d) };
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/external-systems/{systemId}",
    response: (c) => {
      const t = c.params.teamId ?? "";
      const list = declaredOf(t);
      const i = list.findIndex((s) => s.id === c.params.systemId);
      const cur = list[i];
      if (!cur) return notFound;
      const b = c.body as Json;
      if (Array.isArray(b.endpoints) && b.endpoints.length === 0)
        return bad("endpoints", "At least one endpoint");
      const upd = { ...cur, ...b, version: Number(cur.version) + 1 };
      list[i] = upd;
      return { status: 200, body: teamView(t, upd) };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/external-systems/{systemId}",
    response: (c) => {
      const list = declaredOf(c.params.teamId ?? "");
      const i = list.findIndex((s) => s.id === c.params.systemId);
      if (i < 0) return notFound;
      list.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/external-systems/{systemId}/state",
    response: (c) => {
      const s = findSystem(c);
      if (!s) return notFound;
      const key = `${c.params.teamId}/${s.id}`;
      if ((c.body as { enabled: boolean }).enabled) st.teamOff.delete(key);
      else st.teamOff.add(key);
      return { status: 200, body: teamView(c.params.teamId ?? "", s) };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/external-systems",
    response: ({ params }) => ({
      status: 200,
      body: {
        items: allFor(params.teamId ?? "").map((s) =>
          agentView(params.teamId ?? "", params.agentId ?? "", s),
        ),
      },
    }),
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/agents/{agentId}/external-systems/{systemId}/state",
    response: (c) => {
      const s = findSystem(c);
      if (!s) return notFound;
      const key = `${c.params.teamId}/${c.params.agentId}/${s.id}`;
      if ((c.body as { enabled: boolean }).enabled) st.agentOff.delete(key);
      else st.agentOff.add(key);
      return { status: 200, body: agentView(c.params.teamId ?? "", c.params.agentId ?? "", s) };
    },
  },
];
