import { type AfsClient, adminOrgAccounts, agents, teams } from "@afs/sdk";
import type {
  AdminOrgAccountsPort,
  OrgAccountRecord,
} from "../../application/ports/adminOrgAccounts.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

/**
 * `admin.orgAccounts.list`, `teams.allowedAccounts.list` and the agents' role links mapped to
 * {@link AdminOrgAccountsPort}. There is no per-account link count in the API (CQ-19), so it is counted from
 * every agent's role links.
 */
export class SdkAdminOrgAccounts implements AdminOrgAccountsPort {
  constructor(private readonly client: AfsClient) {}

  listOrgAccounts(signal?: AbortSignal): Promise<readonly OrgAccountRecord[]> {
    return wrap(async () => {
      const out: OrgAccountRecord[] = [];
      for await (const a of adminOrgAccounts(this.client).list({ maxResults: 100, ...sig(signal) }))
        out.push({ accountId: a.accountId, name: a.name, status: a.status });
      return out;
    });
  }
  listAllowed(teamId: string, signal?: AbortSignal): Promise<readonly OrgAccountRecord[]> {
    return wrap(async () => {
      const out: OrgAccountRecord[] = [];
      for await (const a of teams(this.client).allowedAccounts.list(teamId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push({ accountId: a.accountId, name: a.name, status: a.status });
      return out;
    });
  }
  linkCounts(teamId: string, signal?: AbortSignal): Promise<Readonly<Record<string, number>>> {
    return wrap(async () => {
      const counts: Record<string, number> = {};
      const ids: string[] = [];
      for await (const a of agents(this.client).list(teamId, { maxResults: 100, ...sig(signal) }))
        ids.push(a.id);
      await Promise.all(
        ids.map(async (id) => {
          for await (const l of agents(this.client).roleLinks.list(teamId, id, {
            maxResults: 100,
            ...sig(signal),
          }))
            counts[l.accountId] = (counts[l.accountId] ?? 0) + 1;
        }),
      );
      return counts;
    });
  }
}
