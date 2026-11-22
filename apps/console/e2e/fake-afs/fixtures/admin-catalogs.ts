import { agentsOf, STORAGE_CLASSES, TEMPLATES } from "./agents.js";
import { TEAMS } from "./core.js";
import type { Fixture, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;
const copy = (l: Json[]): Json[] => l.map((x) => ({ ...x }));
let storage = copy(STORAGE_CLASSES);
let templates = copy(TEMPLATES);
export const resetAdminCatalogs = (): void => {
  storage = copy(STORAGE_CLASSES);
  templates = copy(TEMPLATES);
};

const notFound: FixtureResponse = {
  status: 404,
  body: { code: "NotFound", message: "Not found", requestId: "req_fake_nf" },
};
const usedBy = (field: "storageClass" | "template", name: string): string[] =>
  agentsOf(TEAMS[0].id)
    .filter(
      (a) =>
        (field === "template" ? a.template : (a.volume as Json | undefined)?.storageClass) === name,
    )
    .map((a) => String(a.name));

const inUse = (what: string, agents: string[]): FixtureResponse => ({
  status: 409,
  body: {
    code: "Conflict",
    message: `Agents still use this ${what}`,
    requestId: "req_fake_in_use",
    details: { agents },
  },
});

function put(list: Json[], name: string, body: Json, extra: Json): FixtureResponse {
  const i = list.findIndex((x) => x.name === name);
  const cur = list[i];
  const v: Json = {
    enabled: true,
    ...(cur ?? {}),
    ...body,
    ...extra,
    name,
    version: cur ? Number(cur.version) + 1 : 1,
  };
  if (cur) list[i] = v;
  else list.push(v);
  return { status: 200, body: v };
}

/** The service storage classes and agent templates (M2-G, S10). */
export const adminCatalogsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/storage-classes",
    response: () => ({ status: 200, body: { items: storage } }),
  },
  {
    method: "PUT",
    path: "/v1/admin/storage-classes/{name}",
    response: ({ params, body }) => put(storage, params.name ?? "", body as Json, {}),
  },
  {
    method: "DELETE",
    path: "/v1/admin/storage-classes/{name}",
    response: ({ params }) => {
      const i = storage.findIndex((x) => x.name === params.name);
      if (i < 0) return notFound;
      const used = usedBy("storageClass", params.name ?? "");
      if (used.length) return inUse("storage class", used);
      storage.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/agent-templates",
    response: () => ({ status: 200, body: { items: templates } }),
  },
  {
    method: "PUT",
    path: "/v1/admin/agent-templates/{name}",
    response: ({ params, body }) => put(templates, params.name ?? "", body as Json, {}),
  },
  {
    method: "DELETE",
    path: "/v1/admin/agent-templates/{name}",
    response: ({ params }) => {
      const i = templates.findIndex((x) => x.name === params.name);
      if (i < 0) return notFound;
      const used = usedBy("template", params.name ?? "");
      if (used.length) return inUse("template", used);
      templates.splice(i, 1);
      return { status: 204 };
    },
  },
];
