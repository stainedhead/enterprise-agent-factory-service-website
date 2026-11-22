import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
export const STAGE_IDS = [`stg_${NS}0001`, `stg_${NS}0002`] as const;
export const POOL_IDS = [`pool_${NS}0001`, `pool_${NS}0002`] as const;
export const POOL_LINK_ID = `prl_${NS}0001`;

const status = (phase = "Ready"): Json => ({
  conditions: [],
  observedGeneration: 1,
  phase,
  updatedAt: ts,
});

const seedStages = (): Json[] => [
  {
    id: STAGE_IDS[0],
    name: "scan",
    position: 1,
    description: "Finds affected modules",
    version: 1,
  },
  {
    id: STAGE_IDS[1],
    name: "fix",
    position: 2,
    description: "Edits and opens pull requests",
    version: 1,
  },
];
const pool = (
  id: string,
  name: string,
  stageId: string,
  workers: number,
  over: Json = {},
): Json => ({
  id,
  name,
  template: "hermes-dev",
  image: "ghcr.io/acme/hermes-dev@sha256:4b1e",
  modelId: "claude-sonnet",
  workers,
  stageId,
  state: "enabled",
  handoffs: [],
  scratchSizeGiB: 20,
  sharedVolume: "none",
  generation: 1,
  status: status(),
  version: 1,
  createdAt: ts,
  updatedAt: ts,
  ...over,
});
const seedPools = (): Json[] => [
  pool(POOL_IDS[0], "dep-scanner", STAGE_IDS[0], 4, { handoffs: [POOL_IDS[1]] }),
  pool(POOL_IDS[1], "pr-writer", STAGE_IDS[1], 16, { sharedVolume: "efs", scratchSizeGiB: 40 }),
];
const seedLinks = (): Json[] => [
  {
    id: POOL_LINK_ID,
    accountId: "111122223333",
    roleName: "afs-cve-remediation",
    profileName: "afs-cve-remediation",
    roleArn: "arn:aws:iam::111122223333:role/afs-cve-remediation",
    status: "verified",
    lastVerifiedAt: ts,
    version: 1,
  },
];

interface State {
  stages: Json[];
  pools: Json[];
  links: Map<string, Json[]>;
  handoffsVersion: Map<string, number>;
  seq: number;
}
let st = new Map<string, State>();
export const resetPools = (): void => {
  st = new Map(
    TEAMS.map((t) => [
      t.id,
      {
        stages: seedStages(),
        pools: seedPools(),
        links: new Map([[POOL_IDS[1], seedLinks()]]),
        handoffsVersion: new Map(),
        seq: 100,
      },
    ]),
  );
};
resetPools();

const nf = (what: string) => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf" },
});
const bad = (field: string, message: string) => ({
  status: 400,
  body: {
    code: "ValidationError",
    message,
    requestId: "req_fake_val",
    details: { fields: [{ field, message }] },
  },
});
const ulid = (prefix: string, n: number) => `${prefix}_${NS}${String(n).padStart(4, "0")}`;
const team = (id: string | undefined) => st.get(id ?? "");
const bump = (o: Json): Json => ({ ...o, version: Number(o.version) + 1 });

const poolOf = (teamId: string | undefined, id: string | undefined) =>
  team(teamId)?.pools.find((p) => p.id === id);
const setPool = (teamId: string | undefined, id: string | undefined, f: (p: Json) => Json) => {
  const t = team(teamId);
  const i = t?.pools.findIndex((p) => p.id === id) ?? -1;
  if (!t || i < 0) return undefined;
  const n = bump(f(t.pools[i] as Json));
  t.pools[i] = n;
  return n;
};

/** Stages and pools per team (M5-P): stateful, with worker counts that follow the desired number. */
export const poolsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/stages",
    response: ({ params }) =>
      team(params.teamId)
        ? { status: 200, body: { items: team(params.teamId)?.stages } }
        : nf("Team"),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/stages",
    response: ({ params, body }) => {
      const t = team(params.teamId);
      if (!t) return nf("Team");
      const b = body as Json;
      if (t.stages.some((s) => s.name === b.name))
        return bad("name", "A stage with this name exists");
      const n: Json = { ...b, id: ulid("stg", ++t.seq), version: 1, createdAt: ts };
      t.stages.push(n);
      return { status: 201, body: n };
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/stages/{stageId}",
    response: ({ params, body }) => {
      const t = team(params.teamId);
      const i = t?.stages.findIndex((s) => s.id === params.stageId) ?? -1;
      if (!t || i < 0) return nf("Stage");
      const n = bump({ ...(t.stages[i] as Json), ...(body as Json) });
      t.stages[i] = n;
      return { status: 200, body: n };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/stages/{stageId}",
    response: ({ params }) => {
      const t = team(params.teamId);
      if (!t?.stages.some((s) => s.id === params.stageId)) return nf("Stage");
      t.stages = t.stages.filter((s) => s.id !== params.stageId);
      t.pools = t.pools.map((p) => (p.stageId === params.stageId ? { ...p, stageId: null } : p));
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools",
    response: ({ params }) =>
      team(params.teamId)
        ? { status: 200, body: { items: team(params.teamId)?.pools } }
        : nf("Team"),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/pools",
    response: ({ params, body }) => {
      const t = team(params.teamId);
      if (!t) return nf("Team");
      const b = body as Json;
      if (t.pools.some((p) => p.name === b.name))
        return bad("name", "A pool with this name exists");
      const n = pool(
        ulid("pool", ++t.seq),
        String(b.name),
        String(b.stageId ?? ""),
        Number(b.workers),
        {
          ...b,
          stageId: b.stageId ?? null,
          status: status("Pending"),
        },
      );
      t.pools.push(n);
      return { status: 201, body: n };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}",
    response: ({ params }) => {
      const p = poolOf(params.teamId, params.poolId);
      return p ? { status: 200, body: p } : nf("Pool");
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/pools/{poolId}",
    response: ({ params, body }) => {
      const n = setPool(params.teamId, params.poolId, (p) => ({ ...p, ...(body as Json) }));
      return n ? { status: 200, body: n } : nf("Pool");
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/pools/{poolId}",
    response: ({ params }) => {
      const t = team(params.teamId);
      const p = poolOf(params.teamId, params.poolId);
      if (!t || !p) return nf("Pool");
      t.pools = t.pools.filter((x) => x.id !== params.poolId);
      return { status: 202, body: { ...p, state: "deleting", status: status("Deleting") } };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/pools/{poolId}:scale",
    response: ({ params, body }) => {
      const w = Number((body as Json).workers);
      if (!Number.isInteger(w) || w < 0 || w > 200)
        return bad("workers", "workers must be 0 to 200");
      const n = setPool(params.teamId, params.poolId, (p) => ({ ...p, workers: w }));
      return n ? { status: 200, body: n } : nf("Pool");
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/pools/{poolId}:pause",
    response: ({ params }) => {
      const n = setPool(params.teamId, params.poolId, (p) => ({ ...p, state: "paused" }));
      return n ? { status: 200, body: n } : nf("Pool");
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/pools/{poolId}:resume",
    response: ({ params }) => {
      const n = setPool(params.teamId, params.poolId, (p) => ({ ...p, state: "enabled" }));
      return n ? { status: 200, body: n } : nf("Pool");
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/status",
    response: ({ params }) => {
      const p = poolOf(params.teamId, params.poolId);
      if (!p) return nf("Pool");
      const w = Number(p.workers);
      const impaired = w >= 16 ? 1 : 0;
      const working = Math.floor(w / 2);
      return {
        status: 200,
        body: {
          id: p.id,
          generation: 1,
          status: p.status,
          workers: {
            desired: w,
            reporting: w - impaired,
            working,
            idle: Math.max(0, w - impaired - working),
            impaired,
          },
        },
      };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/handoffs",
    response: ({ params }) => {
      const p = poolOf(params.teamId, params.poolId);
      return p
        ? {
            status: 200,
            body: {
              toPoolIds: p.handoffs,
              version: team(params.teamId)?.handoffsVersion.get(String(p.id)) ?? 1,
            },
          }
        : nf("Pool");
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/pools/{poolId}/handoffs",
    response: ({ params, body }) => {
      const ids = (body as { toPoolIds: string[] }).toPoolIds;
      if (ids.includes(params.poolId ?? ""))
        return bad("toPoolIds", "A pool cannot hand off to itself");
      const n = setPool(params.teamId, params.poolId, (p) => ({ ...p, handoffs: ids }));
      return n ? { status: 200, body: { toPoolIds: ids, version: 1 } } : nf("Pool");
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/secret-bindings",
    response: { status: 200, body: { items: [], version: 1 } },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/pools/{poolId}/secret-bindings",
    response: ({ body }) => ({ status: 200, body: { items: (body as Json).items, version: 2 } }),
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/config-values",
    response: { status: 200, body: { items: [] } },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/pools/{poolId}/config-values/{name}",
    response: ({ params, body }) => ({
      status: 200,
      body: { name: params.name, ...(body as Json), version: 1 },
    }),
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/pools/{poolId}/config-values/{name}",
    response: { status: 204 },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/role-links",
    response: ({ params }) => ({
      status: 200,
      body: { items: team(params.teamId)?.links.get(params.poolId ?? "") ?? [] },
    }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/pools/{poolId}/role-links",
    response: ({ params, body }) => {
      const t = team(params.teamId);
      if (!t) return nf("Team");
      const b = body as Json;
      const list = t.links.get(params.poolId ?? "") ?? [];
      const n: Json = {
        ...b,
        id: ulid("prl", ++t.seq),
        roleArn: `arn:aws:iam::${b.accountId}:role/${b.roleName}`,
        status: "pending_trust",
        version: 1,
      };
      t.links.set(params.poolId ?? "", [...list, n]);
      return { status: 201, body: n };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/pools/{poolId}/role-links/{linkId}:verify",
    response: ({ params }) => {
      const t = team(params.teamId);
      const list = t?.links.get(params.poolId ?? "") ?? [];
      const i = list.findIndex((l) => l.id === params.linkId);
      if (!t || i < 0) return nf("Role link");
      const n = bump({ ...(list[i] as Json), status: "verified", lastVerifiedAt: ts });
      list[i] = n;
      return { status: 202, body: n };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/pools/{poolId}/role-links/{linkId}",
    response: ({ params }) => {
      const t = team(params.teamId);
      const list = t?.links.get(params.poolId ?? "") ?? [];
      if (!t || !list.some((l) => l.id === params.linkId)) return nf("Role link");
      t.links.set(
        params.poolId ?? "",
        list.filter((l) => l.id !== params.linkId),
      );
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/external-systems",
    response: { status: 200, body: { items: [] } },
  },
];
