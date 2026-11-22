import { type AfsClient, budgets, usage } from "@afs/sdk";
import type {
  AgentUsage,
  BudgetRecord,
  BudgetsPort,
  CostLine,
  PutBudgetInput,
  UsageRange,
} from "../../application/ports/budgets.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

/** `budgets.*` and `usage.*` mapped to {@link BudgetsPort}. */
export class SdkBudgets implements BudgetsPort {
  constructor(private readonly client: AfsClient) {}

  get(teamId: string, signal?: AbortSignal): Promise<BudgetRecord> {
    return wrap(() => budgets(this.client).get(teamId, sig(signal)));
  }
  put(teamId: string, version: number, input: PutBudgetInput): Promise<BudgetRecord> {
    return wrap(() =>
      budgets(this.client).put(
        { id: teamId, version },
        {
          amountUsd: input.amountUsd as never,
          period: input.period,
          thresholds: [...input.thresholds],
          onExhaust: input.onExhaust,
        },
      ),
    );
  }
  costs(teamId: string, range: UsageRange, signal?: AbortSignal): Promise<readonly CostLine[]> {
    return wrap(async () => {
      const out: CostLine[] = [];
      for await (const r of usage(this.client).listCosts(teamId, {
        from: range.from,
        to: range.to,
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(r);
      return out;
    });
  }
  usageByAgent(
    teamId: string,
    range: UsageRange,
    signal?: AbortSignal,
  ): Promise<readonly AgentUsage[]> {
    return wrap(async () => {
      const u = await usage(this.client).get(teamId, {
        from: range.from,
        to: range.to,
        groupBy: "agent",
        ...sig(signal),
      });
      return u.rows.map((r) => ({
        agentId: r.key.agent ?? "",
        calls: r.calls,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: r.costUsd,
      }));
    });
  }
  usageCsv(teamId: string, range: UsageRange, signal?: AbortSignal): Promise<string> {
    return wrap(() =>
      usage(this.client)
        .get(teamId, { from: range.from, to: range.to, groupBy: "agent", ...sig(signal) })
        .asCsv(),
    );
  }
}
