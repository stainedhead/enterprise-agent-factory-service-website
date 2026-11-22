import { add, compare, format, parse, percent, subtract } from "../../../domain/money.js";
import { AppError } from "../../errors.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  AgentUsage,
  BudgetRecord,
  BudgetsPort,
  CostLine,
  PutBudgetInput,
  UsageRange,
} from "../../ports/budgets.js";
import { parseThresholds } from "../teams/teamDraft.js";

const ZERO = "0.00";

export interface Reconciliation {
  readonly day: string;
  readonly gatewayUsd: string;
  readonly billedUsd: string;
  /** Signed percentage of the gateway figure, two decimals; 0 when the gateway figure is zero. */
  readonly variancePct: number;
}

export interface BudgetOverview {
  readonly budget: BudgetRecord;
  /** Every day of the month so far, `YYYY-MM-DD`. */
  readonly days: readonly string[];
  /** Per day: gateway spend (Bedrock tokens, real time) and CUR EKS compute, plotted as numbers. */
  readonly bedrock: readonly (number | null)[];
  readonly eks: readonly (number | null)[];
  readonly bedrockUsd: string;
  readonly eksUsd: string;
  /** The latest day with both a gateway and a CUR Bedrock figure; undefined until CUR has arrived. */
  readonly reconciliation: Reconciliation | undefined;
  readonly agents: readonly AgentUsage[];
  readonly percentUsed: number;
}

/** What a budget edit needs to know about the team (ceiling and kind). */
export interface BudgetContext {
  readonly ceilingUsd: string;
  readonly kind: string;
}

export interface BudgetDraft {
  readonly amountUsd: string;
  readonly thresholds: string;
  readonly onExhaust: string;
}

const invalid = (fields: Record<string, string>) =>
  new AppError({ kind: "validation", message: "Check the highlighted fields", fields });

const plot = (money: string) => Number(parse(money)) / 1_000_000;

/** First instant of the UTC month containing `now`, and `now` itself. */
export function monthRange(now: number): UsageRange {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  return { from: iso(start), to: iso(now) };
}

function daysOf(range: UsageRange): string[] {
  const out: string[] = [];
  const end = Date.parse(range.to);
  for (let t = Date.parse(range.from); t <= end; t += 86_400_000)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function sumBy(lines: readonly CostLine[], day: string, source: string): string | undefined {
  const m = lines.filter((l) => l.day === day && l.source === source);
  return m.length === 0 ? undefined : m.reduce((a, l) => add(a, l.costUsd), ZERO);
}

/** Month-to-date budget and usage for T5 (M3-B), and the edit rules (WEB-US-28). */
export class BudgetsUseCases {
  constructor(
    private readonly port: BudgetsPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  /** The budget alone (reloaded after a `412`). */
  budget(teamId: string, signal?: AbortSignal): Promise<BudgetRecord> {
    return this.port.get(teamId, signal);
  }

  async overview(teamId: string, signal?: AbortSignal): Promise<BudgetOverview> {
    const range = monthRange(this.clock.now());
    const [budget, lines, agents] = await Promise.all([
      this.port.get(teamId, signal),
      this.port.costs(teamId, range, signal),
      this.port.usageByAgent(teamId, range, signal),
    ]);
    const days = daysOf(range);
    const gw = days.map((d) => sumBy(lines, d, "gateway"));
    const eks = days.map((d) => sumBy(lines, d, "cur_eks"));
    const total = (xs: (string | undefined)[]) =>
      xs.reduce<string>((a, v) => add(a, v ?? ZERO), ZERO);
    let reconciliation: Reconciliation | undefined;
    for (const d of [...days].reverse()) {
      const g = sumBy(lines, d, "gateway");
      const b = sumBy(lines, d, "cur_bedrock");
      if (g !== undefined && b !== undefined) {
        reconciliation = {
          day: d,
          gatewayUsd: g,
          billedUsd: b,
          variancePct: parse(g) === 0n ? 0 : percent(subtract(b, g), g),
        };
        break;
      }
    }
    return {
      budget,
      days,
      bedrock: gw.map((v) => (v === undefined ? null : plot(v))),
      eks: eks.map((v) => (v === undefined ? null : plot(v))),
      bedrockUsd: total(gw),
      eksUsd: total(eks),
      reconciliation,
      agents: [...agents].sort((a, b) => compare(b.costUsd, a.costUsd)),
      percentUsed: budget.percentUsed ?? percent(budget.spentUsd, budget.amountUsd),
    };
  }

  /** *Edit budget* (WEB-US-28.2): the ceiling and `notify` rules are checked before the API is called. */
  save(
    teamId: string,
    current: BudgetRecord,
    draft: BudgetDraft,
    ctx: BudgetContext,
    version = current.version,
  ): Promise<BudgetRecord> {
    const fields: Record<string, string> = {};
    let amount: bigint | undefined;
    try {
      amount = parse(draft.amountUsd.trim());
    } catch {
      fields.amountUsd = "Enter an amount such as 5000.00";
    }
    if (amount !== undefined && amount <= 0n) fields.amountUsd = "The amount must be above zero";
    else if (amount !== undefined && compare(draft.amountUsd.trim(), ctx.ceilingUsd) > 0)
      fields.amountUsd = `The amount is above the team's ceiling of ${format(ctx.ceilingUsd)}`;
    const thresholds = parseThresholds(draft.thresholds);
    if (thresholds === undefined)
      fields.thresholds = "Enter percentages between 1 and 100, for example 50, 80, 100";
    if (draft.onExhaust === "notify" && ctx.kind !== "persistent")
      fields.onExhaust = "Only persistent teams can notify at exhaustion";
    if (Object.keys(fields).length > 0) return Promise.reject(invalid(fields));
    const input: PutBudgetInput = {
      amountUsd: draft.amountUsd.trim(),
      period: current.period,
      thresholds: thresholds ?? [],
      onExhaust: draft.onExhaust,
    };
    return this.port.put(teamId, version, input);
  }

  /** *Download CSV*: the usage the API returns for the month so far. */
  async usageCsv(
    teamId: string,
    signal?: AbortSignal,
  ): Promise<{ filename: string; text: string }> {
    const range = monthRange(this.clock.now());
    const text = await this.port.usageCsv(teamId, range, signal);
    return { filename: `usage-${teamId}-${range.from.slice(0, 7)}.csv`, text };
  }
}

/** The draft a budget starts from. */
export const toBudgetDraft = (b: BudgetRecord): BudgetDraft => ({
  amountUsd: b.amountUsd,
  thresholds: b.thresholds.join(", "),
  onExhaust: b.onExhaust,
});
