import { AppError } from "../../errors.js";
import type { AdminOrgAccountsPort, OrgAccountRecord } from "../../ports/adminOrgAccounts.js";

/** Glob patterns over account ids and names: `*` matches any run, `?` one character; everything else is literal. */
export function globMatches(pattern: string, text: string): boolean {
  const re = new RegExp(
    `^${pattern
      .split("")
      .map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
      .join("")}$`,
    "i",
  );
  return re.test(text);
}

/** Patterns typed one per line or separated by commas or spaces; blanks and duplicates dropped. */
export function parsePatterns(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
}

export interface MatchedAccount {
  readonly account: OrgAccountRecord;
  /** The first pattern that matched the account's id or name. */
  readonly pattern: string;
  readonly links: number;
}

/** Accounts the patterns allow, each with the pattern that matched and its agent link count (WEB-US-17.1). */
export function matchAccounts(
  patterns: readonly string[],
  accounts: readonly OrgAccountRecord[],
  links: Readonly<Record<string, number>> = {},
): MatchedAccount[] {
  return accounts.flatMap((account) => {
    const pattern = patterns.find(
      (p) => globMatches(p, account.accountId) || (account.name && globMatches(p, account.name)),
    );
    return pattern ? [{ account, pattern, links: links[account.accountId] ?? 0 }] : [];
  });
}

/** What a narrowing change takes away: accounts the current filter allows and the next one does not. */
export function narrowing(
  current: readonly string[],
  next: readonly string[],
  accounts: readonly OrgAccountRecord[],
  links: Readonly<Record<string, number>>,
): { readonly account: OrgAccountRecord; readonly links: number }[] {
  const was = new Set(matchAccounts(current, accounts).map((m) => m.account.accountId));
  const stays = new Set(matchAccounts(next, accounts).map((m) => m.account.accountId));
  return accounts
    .filter((a) => was.has(a.accountId) && !stays.has(a.accountId))
    .map((account) => ({ account, links: links[account.accountId] ?? 0 }));
}

/** Team AWS account access (M4-W). The API decides who may change the filter; this only shapes the UX. */
export class AdminOrgAccountsUseCases {
  constructor(private readonly port: AdminOrgAccountsPort) {}

  /** Service admins see the whole organization; team roles see the accounts the filter allows. */
  accounts(teamId: string, serviceAdmin: boolean, signal?: AbortSignal) {
    return serviceAdmin ? this.port.listOrgAccounts(signal) : this.port.listAllowed(teamId, signal);
  }
  linkCounts(teamId: string, signal?: AbortSignal) {
    return this.port.linkCounts(teamId, signal);
  }
  /** A filter must name at least one pattern; `*` allows every account. */
  check(patterns: readonly string[]): AppError | undefined {
    return patterns.length === 0
      ? new AppError({
          kind: "validation",
          message: "Enter at least one pattern, or * for every account",
          fields: { filter: "Enter at least one pattern, or * for every account" },
        })
      : undefined;
  }
}
