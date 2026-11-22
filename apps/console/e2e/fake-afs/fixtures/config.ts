import { TEAMS } from "./core.js";
import type { Fixture, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const REVIEWER = `agt_${NS}0001`;

interface Stores {
  ns: Map<string, Json[]>;
  agent: Map<string, Json[]>;
}
const fresh = (): Stores => ({ ns: new Map(), agent: new Map() });
let st = fresh();
export const resetConfig = (): void => {
  st = fresh();
};

const nsOf = (teamId: string): Json[] => {
  let v = st.ns.get(teamId);
  if (!v) {
    v =
      teamId === TEAMS[0].id
        ? [
            { name: "LOG_LEVEL", source: "namespace", value: "info", version: 1, updatedAt: ts },
            {
              name: "GITHUB_ORG",
              source: "namespace",
              value: "acme-payments",
              version: 1,
              updatedAt: ts,
            },
          ]
        : [];
    st.ns.set(teamId, v);
  }
  return v;
};

const agentOf = (teamId: string, agentId: string): Json[] => {
  const key = `${teamId}/${agentId}`;
  let v = st.agent.get(key);
  if (!v) {
    v =
      agentId === REVIEWER && teamId === TEAMS[0].id
        ? [
            { name: "LOG_LEVEL", source: "namespace", version: 1 },
            { name: "MAX_OPEN_PRS", source: "literal", value: "3", version: 1 },
          ]
        : [];
    st.agent.set(key, v);
  }
  return v;
};

const usedBy = (teamId: string, name: string): string[] => {
  // every agent whose own list refers to the namespace value (the seeded agent, plus any edited since)
  const out: string[] = [];
  if (teamId === TEAMS[0].id) agentOf(teamId, REVIEWER);
  for (const [key, vals] of st.agent)
    if (
      key.startsWith(`${teamId}/`) &&
      vals.some((v) => v.name === name && v.source === "namespace")
    )
      out.push(key.split("/")[1] as string);
  return out;
};

const nsView = (teamId: string, v: Json): Json => ({
  ...v,
  usedBy: usedBy(teamId, String(v.name)),
});
const agentView = (teamId: string, v: Json): Json => {
  if (v.source !== "namespace") return { ...v, resolvedValue: v.value ?? null };
  const n = nsOf(teamId).find((x) => x.name === v.name);
  return { ...v, resolvedValue: (n?.value as string | undefined) ?? null };
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
const CREDENTIAL = /(password|secret|token|key)/i;

/** Namespace and agent configuration values (M2-V); the namespace's `usedBy` follows the agents' own lists. */
export const configFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/config-values",
    response: ({ params }) => {
      const t = params.teamId ?? "";
      return { status: 200, body: { items: nsOf(t).map((v) => nsView(t, v)) } };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/config-values/{name}",
    response: ({ params, body }) => {
      const t = params.teamId ?? "";
      const name = params.name ?? "";
      if (CREDENTIAL.test(name)) return bad("name", "Credential-like names belong under Secrets");
      const list = nsOf(t);
      const i = list.findIndex((v) => v.name === name);
      const cur = list[i];
      const v: Json = {
        name,
        source: "namespace",
        value: (body as Json).value,
        version: cur ? Number(cur.version) + 1 : 1,
        updatedAt: ts,
      };
      if (cur) list[i] = v;
      else list.push(v);
      return { status: 200, body: nsView(t, v) };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/config-values/{name}",
    response: ({ params }) => {
      const t = params.teamId ?? "";
      const list = nsOf(t);
      const i = list.findIndex((v) => v.name === params.name);
      if (i < 0)
        return {
          status: 404,
          body: { code: "NotFound", message: "Value not found", requestId: "req_fake_nf" },
        };
      if (usedBy(t, String(params.name)).length > 0)
        return {
          status: 409,
          body: {
            code: "Conflict",
            message: "Agents use this value",
            requestId: "req_fake_in_use",
            details: { reason: "config_value_in_use" },
          },
        };
      list.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/config-values",
    response: ({ params }) => {
      const t = params.teamId ?? "";
      return {
        status: 200,
        body: { items: agentOf(t, params.agentId ?? "").map((v) => agentView(t, v)) },
      };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/agents/{agentId}/config-values/{name}",
    response: ({ params, body }) => {
      const t = params.teamId ?? "";
      const name = params.name ?? "";
      if (CREDENTIAL.test(name)) return bad("name", "Credential-like names belong under Secrets");
      const b = body as Json;
      const list = agentOf(t, params.agentId ?? "");
      const i = list.findIndex((v) => v.name === name);
      const cur = list[i];
      const v: Json = {
        name,
        source: b.source,
        ...(b.source === "literal" ? { value: b.value } : {}),
        version: cur ? Number(cur.version) + 1 : 1,
      };
      if (cur) list[i] = v;
      else list.push(v);
      return { status: 200, body: agentView(t, v) };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/agents/{agentId}/config-values/{name}",
    response: ({ params }) => {
      const list = agentOf(params.teamId ?? "", params.agentId ?? "");
      const i = list.findIndex((v) => v.name === params.name);
      if (i < 0)
        return {
          status: 404,
          body: { code: "NotFound", message: "Value not found", requestId: "req_fake_nf" },
        };
      list.splice(i, 1);
      return { status: 204 };
    },
  },
];
