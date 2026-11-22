// Pure rules for the ephemeral-team budget step (M5-E1, M5-E2): lifetime budget, expiry and teardown rule.
import { compare, parse, toMoney } from "../../../domain/money.js";

export type TeardownRule = "at_cap_or_expiry" | "at_expiry";

/** The extra draft state of an ephemeral team. */
export interface EphemeralDraft {
  /** `YYYY-MM-DD`, the day the team expires (00:00 UTC). */
  readonly expiresOn: string;
  readonly teardownRule: TeardownRule;
  /** Expected daily spend in USD; blank means "spread the budget over the lifetime". */
  readonly dailyCostUsd: string;
}

export const DEFAULT_EPHEMERAL_MAX_DAYS = 90;

export const emptyEphemeral = (): EphemeralDraft => ({
  expiresOn: "",
  teardownRule: "at_cap_or_expiry",
  dailyCostUsd: "",
});

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The expiry as the timestamp `CreateTeam` takes, or undefined when `expiresOn` is not a date. */
export function expiryTimestamp(expiresOn: string): string | undefined {
  if (!DATE.test(expiresOn)) return undefined;
  const t = Date.parse(`${expiresOn}T00:00:00Z`);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().replace(".000Z", "Z");
}

/** Field errors of the ephemeral part of the budget step; empty means *Next* is enabled. */
export function validateEphemeral(
  lifetimeBudgetUsd: string,
  e: EphemeralDraft,
  maxDays: number,
  now: Date,
): Record<string, string> {
  const errs: Record<string, string> = {};
  try {
    if (compare(lifetimeBudgetUsd, "0") <= 0)
      errs.maxBudgetUsd = "Enter a lifetime budget above zero";
  } catch {
    errs.maxBudgetUsd = "Enter an amount such as 2000.00";
  }
  const ts = expiryTimestamp(e.expiresOn);
  if (e.expiresOn === "") errs.expiresOn = "Choose the expiry date";
  else if (ts === undefined) errs.expiresOn = "Enter a date such as 2026-12-15";
  else {
    const t = Date.parse(ts);
    if (t <= now.getTime()) errs.expiresOn = "The expiry must be in the future";
    else if (t > now.getTime() + maxDays * DAY_MS)
      errs.expiresOn = `An ephemeral team lasts at most ${maxDays} days`;
  }
  if (e.dailyCostUsd !== "") {
    try {
      if (compare(e.dailyCostUsd, "0") <= 0) errs.dailyCostUsd = "Enter an amount above zero";
    } catch {
      errs.dailyCostUsd = "Enter an amount such as 60.00";
    }
  }
  return errs;
}

export interface Estimate {
  readonly dailyUsd: string;
  /** Days until the cap is reached at that daily cost (rounded up). */
  readonly capDays: number;
  /** `YYYY-MM-DD` the cap would be reached. */
  readonly capDate: string;
  /** The cap would be reached after the team expires. */
  readonly afterExpiry: boolean;
}

/**
 * The estimate shown under the budget step (WEB-US-38.2): the daily cost (typed, else the budget spread over
 * the days to expiry) and the date the cap would be reached at that rate. Undefined while inputs are invalid.
 */
export function estimate(
  lifetimeBudgetUsd: string,
  e: EphemeralDraft,
  now: Date,
): Estimate | undefined {
  const ts = expiryTimestamp(e.expiresOn);
  if (ts === undefined) return undefined;
  try {
    const budget = parse(lifetimeBudgetUsd);
    if (budget <= 0n) return undefined;
    const days = Math.max(1, Math.ceil((Date.parse(ts) - now.getTime()) / DAY_MS));
    const daily =
      e.dailyCostUsd !== "" ? parse(e.dailyCostUsd) : (budget + BigInt(days) - 1n) / BigInt(days);
    if (daily <= 0n) return undefined;
    const capDays = Number((budget + daily - 1n) / daily);
    const cap = new Date(now.getTime() + capDays * DAY_MS);
    return {
      dailyUsd: toMoney(daily),
      capDays,
      capDate: cap.toISOString().slice(0, 10),
      afterExpiry: cap.getTime() > Date.parse(ts),
    };
  } catch {
    return undefined;
  }
}

/** The words for a teardown reason. */
export const TEARDOWN_REASON: Readonly<Record<string, string>> = {
  expired: "The team reached its expiry",
  cap_reached: "The lifetime budget cap was reached",
  work_complete: "The work was complete",
  manual: "A service admin tore the team down",
};

export interface EphemeralStatus {
  readonly tornDown: boolean;
  /** Whole days (rounded up) until expiry; 0 when due or past; undefined without an expiry. */
  readonly daysLeft: number | undefined;
  readonly tornDownAt: string | undefined;
  readonly reason: string | undefined;
}

/** What the T1 ephemeral card shows about the team's lifetime (WEB-US-38.3). */
export function ephemeralStatus(
  t: { expiresAt?: string; tornDownAt?: string; teardownReason?: string; state: string },
  now: Date,
): EphemeralStatus {
  const tornDown = t.tornDownAt !== undefined || t.state === "deleted";
  const days =
    t.expiresAt === undefined
      ? undefined
      : Math.max(0, Math.ceil((Date.parse(t.expiresAt) - now.getTime()) / DAY_MS));
  return {
    tornDown,
    daysLeft: days,
    tornDownAt: t.tornDownAt,
    reason: t.teardownReason ? (TEARDOWN_REASON[t.teardownReason] ?? t.teardownReason) : undefined,
  };
}
