import { type AfsClient, agents, audit, budgets } from "@afs/sdk";
import type {
  ActivityRecord,
  AgentSummary,
  BudgetRecord,
  OverviewPort,
} from "../../application/ports/overview.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

/** Budget, agents and audit reads for the team overview. */
export class SdkOverview implements OverviewPort {
  constructor(private readonly client: AfsClient) {}

  budget(teamId: string, signal?: AbortSignal): Promise<BudgetRecord> {
    return wrap(() => budgets(this.client).get(teamId, sig(signal)));
  }
  agents(teamId: string, signal?: AbortSignal): Promise<readonly AgentSummary[]> {
    return wrap(async () =>
      (
        await agents(this.client)
          .list(teamId, { maxResults: 100, ...sig(signal) })
          .first()
      ).items.map((a) => ({
        id: a.id,
        name: a.name,
        paused: a.paused,
        status: a.status,
        iamIdentity: a.iamIdentity,
        ...(a.iamRoleArn !== undefined && { iamRoleArn: a.iamRoleArn }),
      })),
    );
  }
  recentActivity(
    teamId: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<readonly ActivityRecord[]> {
    return wrap(
      async () =>
        (
          await audit(this.client)
            .list(teamId, { maxResults: limit, ...sig(signal) })
            .first()
        ).items,
    );
  }
}
