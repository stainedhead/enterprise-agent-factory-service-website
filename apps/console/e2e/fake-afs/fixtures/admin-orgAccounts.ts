import type { Fixture } from "./index.js";
import { teamBody } from "./teams.js";

const ts = "2026-11-21T18:00:00Z";
export const ACCOUNTS = [
  ["111122223333", "prod-payments", "active"],
  ["222233334444", "prod-platform", "active"],
  ["444455556666", "staging-payments", "active"],
  ["555566667777", "sandbox-dev", "active"],
  ["666677778888", "security-audit", "suspended"],
] as const;

/** The same glob as the console and the API: `*` any run, `?` one character. */
export const glob = (pattern: string, text: string): boolean =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
    "i",
  ).test(text);

/** Organization accounts, and the accounts a team's filter allows (M4-W). */
export const adminOrgAccountsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/org-accounts",
    response: {
      status: 200,
      body: {
        items: ACCOUNTS.map(([accountId, name, status]) => ({
          accountId,
          name,
          status,
          syncedAt: ts,
        })),
      },
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/allowed-accounts",
    response: ({ params }) => {
      const patterns = (teamBody(params.teamId ?? "")?.allowedAwsAccounts ?? []) as string[];
      return {
        status: 200,
        body: {
          items: ACCOUNTS.filter(([id, name]) =>
            patterns.some((p) => glob(p, id) || glob(p, name)),
          ).map(([accountId, name, status]) => ({ accountId, name, status })),
        },
      };
    },
  },
];
