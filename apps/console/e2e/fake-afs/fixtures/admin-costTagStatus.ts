import type { Fixture } from "./index.js";

const checkedAt = "2026-11-21T18:00:00Z";

/** Per-key cost tag status for S9 (M5-T): two healthy keys, one active key gone unseen, one inactive. */
export const adminCostTagStatusFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/cost-tag-status",
    response: () => ({
      status: 200,
      body: {
        items: [
          {
            key: "afs-team-id",
            seenInCur: true,
            firstSeenAt: "2026-10-02T00:00:00Z",
            lastSeenAt: "2026-11-20T00:00:00Z",
            awsStatus: "active",
            checkedAt,
          },
          {
            key: "afs-agent-id",
            seenInCur: true,
            firstSeenAt: "2026-10-05T00:00:00Z",
            lastSeenAt: "2026-11-20T00:00:00Z",
            awsStatus: "active",
            checkedAt,
          },
          {
            key: "environment",
            seenInCur: false,
            firstSeenAt: "2026-10-10T00:00:00Z",
            lastSeenAt: "2026-11-10T00:00:00Z",
            awsStatus: "active",
            checkedAt,
          },
          { key: "cost-center", seenInCur: false, awsStatus: "inactive", checkedAt },
        ],
      },
    }),
  },
];
