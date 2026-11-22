// The organization accounts port (M4-W): `ListOrgAccounts` (service admins), `ListAllowedAccounts` (the accounts
// the team's filter allows, for team roles) and the agent links per account.

export interface OrgAccountRecord {
  readonly accountId: string;
  readonly name: string | undefined;
  readonly status: string | undefined;
}

export interface AdminOrgAccountsPort {
  /** Every account of the organization (`admin:accounts`). */
  listOrgAccounts(signal?: AbortSignal): Promise<readonly OrgAccountRecord[]>;
  /** The accounts the team's filter allows (`identities:read`). */
  listAllowed(teamId: string, signal?: AbortSignal): Promise<readonly OrgAccountRecord[]>;
  /** Cross-account role links per account id across the team's agents. */
  linkCounts(teamId: string, signal?: AbortSignal): Promise<Readonly<Record<string, number>>>;
}
