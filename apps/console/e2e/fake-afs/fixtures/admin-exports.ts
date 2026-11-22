import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const ts = "2026-11-21T18:00:00Z";
export const EXPORT_IDS = [`exp_${NS}0001`, `exp_${NS}0002`] as const;

const seed = (): Json[] => [
  {
    id: EXPORT_IDS[0],
    status: "succeeded",
    schemaVersion: 1,
    createdAt: ts,
    finishedAt: "2026-11-21T18:02:00Z",
    sizeBytes: 482_304,
    sha256: "9f2c1d6e4b7a5c3d8e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f",
    downloadUrl: "https://exports.example.test/exp-1.json",
    downloadExpiresAt: "2099-01-01T00:00:00Z",
    teamIds: [],
  },
  {
    id: EXPORT_IDS[1],
    status: "succeeded",
    schemaVersion: 1,
    createdAt: "2026-11-01T09:00:00Z",
    finishedAt: "2026-11-01T09:01:00Z",
    sizeBytes: 120_000,
    sha256: "0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9",
    downloadUrl: null,
    downloadExpiresAt: "2026-11-08T09:00:00Z",
    teamIds: [],
  },
];

let exportsList: Json[] = [];
export const resetAdminExports = (): void => {
  exportsList = seed();
};
resetAdminExports();

/** A new export is `pending`, then `running`, then `succeeded`: one step per read (progress is polled). */
const advance = (): void => {
  for (const e of exportsList) {
    if (e.status === "pending") e.status = "running";
    else if (e.status === "running")
      Object.assign(e, {
        status: "succeeded",
        finishedAt: ts,
        sizeBytes: 2048,
        sha256: "ab".repeat(32),
        downloadUrl: `https://exports.example.test/${String(e.id)}.json`,
        downloadExpiresAt: "2099-01-01T00:00:00Z",
      });
  }
};

/** Exports (`202` then polled) and imports (`dryRun` plans every team the bundle names; a slug with `bad` fails). */
export const adminExportsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/exports",
    response: () => {
      const body = { items: exportsList.map((e) => ({ ...e })) };
      advance();
      return { status: 200, body };
    },
  },
  {
    method: "POST",
    path: "/v1/exports",
    response: ({ body }) => {
      const e: Json = {
        id: `exp_${NS}${String(100 + exportsList.length).padStart(4, "0")}`,
        status: "pending",
        schemaVersion: 1,
        createdAt: ts,
        teamIds: (body as { teamIds?: string[] } | undefined)?.teamIds ?? [],
      };
      exportsList = [e, ...exportsList];
      return { status: 202, body: e };
    },
  },
  {
    method: "GET",
    path: "/v1/exports/{exportId}",
    response: ({ params }) => {
      const e = exportsList.find((x) => x.id === params.exportId);
      if (!e)
        return {
          status: 404,
          body: { code: "NotFound", message: "Export not found", requestId: "req_fake_nf" },
        };
      const body = { ...e };
      advance();
      return { status: 200, body };
    },
  },
  {
    method: "POST",
    path: "/v1/imports",
    response: ({ query, body }) => {
      const teams = (
        (body as { bundle?: { teams?: { slug?: string }[] } }).bundle?.teams ?? [
          { slug: "payments" },
        ]
      ).map((t) => String(t.slug ?? "payments"));
      return {
        status: 200,
        body: {
          dryRun: query.get("dryRun") === "true",
          teams: teams.map((slug) =>
            slug.includes("bad")
              ? { slug, result: "failed", changes: [], error: "Unknown model in the bundle" }
              : { slug, result: "updated", changes: ["agents +1", "budget updated"] },
          ),
        },
      };
    },
  },
];
