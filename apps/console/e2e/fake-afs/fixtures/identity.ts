import { AGENT_IDS } from "./agents.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
export const LINK_IDS = [`lnk_${NS}0001`, `lnk_${NS}0002`] as const;

const seedLinks = (): Json[] => [
  {
    id: LINK_IDS[0],
    accountId: "111122223333",
    roleArn: "arn:aws:iam::111122223333:role/afs-triage",
    profileName: "prod-payments",
    maxSessionSeconds: 3600,
    externalId: "afs-ext-0001",
    status: "verified",
    lastVerifiedAt: ts,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
  {
    id: LINK_IDS[1],
    accountId: "444455556666",
    roleArn: "arn:aws:iam::444455556666:role/afs-triage",
    profileName: "staging-payments",
    externalId: "afs-ext-0002",
    status: "pending_trust",
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
];

/** Role links per dedicated agent: the seeded second agent has two. */
export let roleLinks = new Map<string, Json[]>();
export const resetIdentity = (): void => {
  roleLinks = new Map([[AGENT_IDS[1], seedLinks()]]);
};
resetIdentity();

/** Agent role links (read here for the account link counts, M4-W; T8 extends this module in M4-I). */
export const identityFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/role-links",
    response: ({ params }) => ({
      status: 200,
      body: { items: roleLinks.get(params.agentId ?? "") ?? [] },
    }),
  },
];
