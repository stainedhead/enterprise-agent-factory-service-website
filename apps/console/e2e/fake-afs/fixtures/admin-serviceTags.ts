import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const seedTags = (): Json[] => [
  {
    key: "environment",
    mode: "required",
    allowedValues: ["prod", "staging", "dev"],
    description: "Deployment environment",
    updatedAt: ts,
    version: 1,
  },
  {
    key: "region",
    mode: "fixed",
    value: "eu-west-1",
    description: "Home region",
    updatedAt: ts,
    version: 1,
  },
];

let serviceTags: Json[] = seedTags();

/** The service tags as the fixtures of other areas read them (S3 required tags). */
export const currentServiceTags = (): readonly Json[] => serviceTags;

const seedTeamTags = (i: number): { tags: Json[]; dropped: string[]; version: number } => ({
  tags: [
    { key: "afs-team-id", source: "system", value: TEAMS[i]?.id },
    { key: "afs-team-slug", source: "system", value: TEAMS[i]?.slug },
    { key: "region", source: "service", value: "eu-west-1" },
    { key: "environment", source: "missing" },
    { key: "cost-center", source: "team", value: i === 0 ? "CC-100" : "CC-200" },
  ],
  dropped: i === 0 ? ["zz-extra-tag"] : [],
  version: 1,
});

let teamTags = new Map<string, ReturnType<typeof seedTeamTags>>();
export const resetAdminServiceTags = (): void => {
  serviceTags = seedTags();
  teamTags = new Map(TEAMS.map((t, i) => [t.id, seedTeamTags(i)]));
};
resetAdminServiceTags();

const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Not found", requestId: "req_fake_nf" },
};
const body = (t: { tags: Json[]; dropped: string[]; version: number }) => ({
  tags: t.tags,
  requestMetadataDroppedKeys: t.dropped,
  version: t.version,
});

/** Service tags (S9) and team tags (T13) with the missing-required-value state (M4-G). */
export const adminServiceTagsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/service-tags",
    response: () => ({ status: 200, body: { items: serviceTags } }),
  },
  {
    method: "PUT",
    path: "/v1/admin/service-tags/{key}",
    response: ({ params, body: b }) => {
      const key = params.key ?? "";
      const i = serviceTags.findIndex((t) => t.key === key);
      const next: Json = {
        ...(b as Json),
        key,
        updatedAt: ts,
        version: i < 0 ? 1 : Number(serviceTags[i]?.version) + 1,
      };
      if (i < 0) serviceTags.push(next);
      else serviceTags[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/service-tags/{key}",
    response: ({ params }) => {
      if (!serviceTags.some((t) => t.key === params.key)) return notFound;
      serviceTags = serviceTags.filter((t) => t.key !== params.key);
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/tags",
    response: ({ params }) => {
      const t = teamTags.get(params.teamId ?? "");
      return t ? { status: 200, body: body(t) } : notFound;
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/tags",
    response: ({ params, body: b }) => {
      const t = teamTags.get(params.teamId ?? "");
      if (!t) return notFound;
      const sent = ((b as { tags?: { key: string; value: string }[] }).tags ?? []).map((x) => ({
        key: x.key,
        value: x.value,
        source: "team",
      }));
      const kept = t.tags.filter((x) => x.source === "system" || x.source === "service");
      const stillMissing = t.tags.filter(
        (x) => x.source === "missing" && !sent.some((s) => s.key === x.key),
      );
      t.tags = [...kept, ...stillMissing, ...sent];
      t.version += 1;
      return { status: 200, body: body(t) };
    },
  },
];
