import { ACCOUNTS, glob } from "./admin-orgAccounts.js";
import { AGENT_IDS } from "./agents.js";
import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";
import { teamBody } from "./teams.js";

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
  resetIdentities();
};

const ROLE_PREFIX = "arn:aws:iam::000000000000:role/afs/agents/afs-payments/triage";

const trustPolicy = (externalId: string) => ({
  Effect: "Allow",
  Principal: { AWS: ROLE_PREFIX },
  Action: ["sts:AssumeRole", "sts:TagSession"],
  Condition: {
    StringEquals: { "sts:ExternalId": externalId, "aws:PrincipalTag/afs-team-id": TEAMS[0].id },
  },
});

const notFound = (what: string) => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf" },
});
const invalid = (field: string, message: string) => ({
  status: 400,
  body: {
    code: "ValidationError",
    message,
    requestId: "req_fake_val",
    details: { fields: [{ field, message, reason: "invalid" }] },
  },
});
const find = (agentId: string | undefined, id: string | undefined) =>
  (roleLinks.get(agentId ?? "") ?? []).find((l) => l.id === id);
const withPolicy = (l: Json): Json => ({ ...l, trustPolicy: trustPolicy(String(l.externalId)) });

const seedIdentities = (): Json[] => [
  {
    id: `aid_${NS}0001`,
    kind: "github_app",
    externalRef: "app-123456",
    secretId: `sec_${NS}0001`,
    status: "active",
    createdAt: ts,
    updatedAt: ts,
    version: 1,
  },
];
export let identities = new Map<string, Json[]>();
const resetIdentities = (): void => {
  identities = new Map([[AGENT_IDS[0], seedIdentities()]]);
};
resetIdentities();

/** Agent role links (with trust policies and verification) and external identities (M4-I). */
export const identityFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/role-links",
    response: ({ params }) => ({
      status: 200,
      body: { items: roleLinks.get(params.agentId ?? "") ?? [] },
    }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}/role-links",
    response: ({ params, body }) => {
      const b = body as { roleArn: string; profileName: string; maxSessionSeconds?: number };
      const accountId = /^arn:aws:iam::(\d{12}):role\//.exec(b.roleArn)?.[1] ?? "";
      if (params.agentId !== AGENT_IDS[1])
        return invalid("roleArn", "Only an agent with a dedicated role can have role links");
      const patterns = (teamBody(params.teamId ?? "")?.allowedAwsAccounts ?? []) as string[];
      const acct = ACCOUNTS.find(([id]) => id === accountId);
      if (!acct || !patterns.some((p) => glob(p, acct[0]) || glob(p, acct[1])))
        return invalid("roleArn", `Account ${accountId} is outside the team's allowed accounts`);
      const list = roleLinks.get(params.agentId ?? "") ?? [];
      const link: Json = {
        id: `lnk_${NS}${String(100 + list.length).padStart(4, "0")}`,
        accountId,
        roleArn: b.roleArn,
        profileName: b.profileName,
        ...(b.maxSessionSeconds !== undefined && { maxSessionSeconds: b.maxSessionSeconds }),
        externalId: `afs-ext-${100 + list.length}`,
        status: "pending_trust",
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      };
      roleLinks.set(params.agentId ?? "", [...list, link]);
      // the trust policy is read with GetAgentRoleLink, not returned by the create
      return { status: 201, body: link };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/role-links/{linkId}",
    response: ({ params }) => {
      const l = find(params.agentId, params.linkId);
      return l ? { status: 200, body: withPolicy(l) } : notFound("Link");
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/agents/{agentId}/role-links/{linkId}",
    response: ({ params }) => {
      if (!find(params.agentId, params.linkId)) return notFound("Link");
      roleLinks.set(
        params.agentId ?? "",
        (roleLinks.get(params.agentId ?? "") ?? []).filter((l) => l.id !== params.linkId),
      );
      return { status: 204 };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}/role-links/{linkId}:verify",
    response: ({ params }) => {
      const l = find(params.agentId, params.linkId);
      if (!l) return notFound("Link");
      const failing = String(l.roleArn).includes("blocked");
      // 202: the result is read on the next list or get
      const accepted = { ...l };
      Object.assign(l, {
        status: failing ? "failed" : "verified",
        lastVerifiedAt: failing ? null : "2026-11-22T06:00:00Z",
        lastError: failing
          ? "AccessDenied: the role does not trust this agent (add the trust policy)"
          : null,
        version: Number(l.version) + 1,
      });
      return { status: 202, body: accepted };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/identities",
    response: ({ params }) => ({
      status: 200,
      body: { items: identities.get(params.agentId ?? "") ?? [] },
    }),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/agents/{agentId}/identities",
    response: ({ params, body }) => {
      const list = identities.get(params.agentId ?? "") ?? [];
      const n: Json = {
        ...(body as Json),
        id: `aid_${NS}${String(100 + list.length).padStart(4, "0")}`,
        status: "pending",
        createdAt: ts,
        updatedAt: ts,
        version: 1,
      };
      identities.set(params.agentId ?? "", [...list, n]);
      return { status: 201, body: n };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/agents/{agentId}/identities/{identityId}",
    response: ({ params }) => {
      const list = identities.get(params.agentId ?? "") ?? [];
      if (!list.some((i) => i.id === params.identityId)) return notFound("Identity");
      identities.set(
        params.agentId ?? "",
        list.filter((i) => i.id !== params.identityId),
      );
      return { status: 204 };
    },
  },
];

resetIdentity();
