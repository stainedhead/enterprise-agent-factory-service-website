import type { AfsClient } from "@afs/sdk";
import type { ClockPort } from "../application/ports/auth.js";
import {
  ApiKeysUseCases,
  MembersUseCases,
} from "../application/usecases/members/MembersUseCases.js";
import { OverviewUseCases } from "../application/usecases/overview/OverviewUseCases.js";
import type { ListProviders } from "../application/usecases/session/ListProviders.js";
import { TeamsUseCases } from "../application/usecases/teams/TeamsUseCases.js";
import { SdkApiKeys, SdkMembers } from "../infrastructure/sdk/members.js";
import { SdkOverview, SdkWorkOrders } from "../infrastructure/sdk/overview.js";
import { SdkTeams } from "../infrastructure/sdk/teams.js";
import type { AppServices } from "../presentation/services.js";

// Shared list (architecture.md §3.2): one line per port. Unbuilt areas get notImplementedPort, which
// throws Unavailable on first use; M6-X1 fails while any remains.
export class NotImplementedError extends Error {
  readonly area: string;
  constructor(area: string) {
    super(`Port "${area}" is not implemented yet`);
    this.name = "NotImplementedError";
    this.area = area;
  }
}

export function notImplementedPort<T extends object>(area: string): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      if (prop === "then") return undefined;
      return () => {
        throw new NotImplementedError(area);
      };
    },
  });
}

/**
 * The use cases of every wired area (architecture §3.2: one line per area). An area that no stream has
 * wired yet is absent; `useService` then fails loudly, and M6-X1 checks that none is missing.
 */
export function buildServices(
  client: AfsClient,
  clock: Pick<ClockPort, "now">,
  shared: { listProviders: ListProviders },
): Partial<AppServices> {
  return {
    signInProviders: shared.listProviders,
    teams: new TeamsUseCases(new SdkTeams(client), clock),
    members: new MembersUseCases(new SdkMembers(client)),
    apiKeys: new ApiKeysUseCases(new SdkApiKeys(client), clock),
    overview: new OverviewUseCases(new SdkOverview(client), new SdkWorkOrders(client)),
  };
}
