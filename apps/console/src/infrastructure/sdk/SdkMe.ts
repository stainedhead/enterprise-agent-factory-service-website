import { type AfsClient, me, teams, workOrders } from "@afs/sdk";
import type { MePort, SearchPort } from "../../application/ports/me.js";
import type { Me } from "../../domain/me.js";
import { PERMISSIONS, type Permission } from "../../domain/permission.js";
import { toAppError } from "./errors.js";

const known = new Set<string>(PERMISSIONS);
// An unknown permission from a newer server is dropped: it cannot gate anything this build knows about.
const perms = (xs: readonly string[] | undefined): Permission[] =>
  (xs ?? []).filter((p): p is Permission => known.has(p));

/** `GetMe` mapped to the domain's `Me`. */
export class SdkMe implements MePort {
  constructor(private readonly client: AfsClient) {}

  async get(signal?: AbortSignal): Promise<Me> {
    try {
      const r = await me(this.client).get(signal ? { signal } : undefined);
      return {
        principal: {
          id: r.principal.id,
          type: r.principal.type as Me["principal"]["type"],
          ...(r.principal.email !== undefined && { email: r.principal.email }),
          ...(r.principal.name !== undefined && { name: r.principal.name }),
        },
        serviceAdmin: r.serviceAdmin,
        securityOperator: r.securityOperator,
        ...(r.servicePermissions && { servicePermissions: perms(r.servicePermissions) }),
        teams: r.teams.map((t) => ({
          teamId: t.teamId,
          slug: t.slug,
          role: t.role as Me["teams"][number]["role"],
          permissions: perms(t.permissions),
        })),
      };
    } catch (e) {
      throw toAppError(e);
    }
  }
}

/** List calls for the header search. */
export class SdkSearch implements SearchPort {
  constructor(private readonly client: AfsClient) {}

  async listTeams(signal?: AbortSignal): Promise<{ teamId: string; label: string }[]> {
    try {
      const out: { teamId: string; label: string }[] = [];
      for await (const t of teams(this.client).list(
        signal ? { signal, maxResults: 100 } : { maxResults: 100 },
      )) {
        out.push({ teamId: t.id, label: t.displayName });
      }
      return out;
    } catch (e) {
      throw toAppError(e);
    }
  }

  async listWorkOrders(signal?: AbortSignal) {
    try {
      const page = await workOrders(this.client)
        .list(signal ? { signal, maxResults: 100 } : { maxResults: 100 })
        .first();
      return page.items.map((w) => ({ id: w.id, title: w.title, cveId: w.cveId }));
    } catch (e) {
      throw toAppError(e);
    }
  }
}
