import { catalogStore, extId, nextExtSeq } from "./externalSystems.js";
import type { Fixture, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;
const notFound: FixtureResponse = {
  status: 404,
  body: { code: "NotFound", message: "System not found", requestId: "req_fake_nf" },
};

/** The service catalog (M2-F, S7); shares its store with the team fixtures, so a service-level switch shows in T9. */
export const adminExternalSystemsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/external-systems",
    response: () => ({ status: 200, body: { items: catalogStore() } }),
  },
  {
    method: "POST",
    path: "/v1/admin/external-systems",
    response: ({ body }) => {
      const d: Json = {
        id: extId(200 + nextExtSeq()),
        enabled: true,
        ...(body as Json),
        builtin: false,
        scope: "service",
        version: 1,
        createdAt: "2026-11-21T18:00:00Z",
      };
      catalogStore().push(d);
      return { status: 201, body: d };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/external-systems/{systemId}",
    response: ({ params }) => {
      const s = catalogStore().find((x) => x.id === params.systemId);
      return s ? { status: 200, body: s } : notFound;
    },
  },
  {
    method: "PATCH",
    path: "/v1/admin/external-systems/{systemId}",
    response: ({ params, body }) => {
      const list = catalogStore();
      const i = list.findIndex((x) => x.id === params.systemId);
      const cur = list[i];
      if (!cur) return notFound;
      const upd = { ...cur, ...(body as Json), version: Number(cur.version) + 1 };
      list[i] = upd;
      return { status: 200, body: upd };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/external-systems/{systemId}",
    response: ({ params }) => {
      const list = catalogStore();
      const i = list.findIndex((x) => x.id === params.systemId);
      if (i < 0) return notFound;
      list.splice(i, 1);
      return { status: 204 };
    },
  },
];
