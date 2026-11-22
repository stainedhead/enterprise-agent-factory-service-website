import { AppError } from "../../errors.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  AgentIdentityInput,
  IdentityPort,
  RoleLinkInput,
  RoleLinkRecord,
} from "../../ports/identity.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

const ROLE_ARN = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@/-]+$/;
const PROFILE = /^[A-Za-z0-9_-]{1,64}$/;

/** The maximum session lengths a link may have: 15 minutes to 12 hours (AGT-10). */
export const SESSION_CHOICES: readonly { seconds: number; label: string }[] = [
  { seconds: 900, label: "15 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 14400, label: "4 hours" },
  { seconds: 43200, label: "12 hours" },
];

export const sessionLabel = (seconds: number | undefined): string =>
  seconds === undefined
    ? "Default"
    : (SESSION_CHOICES.find((c) => c.seconds === seconds)?.label ??
      `${Math.round(seconds / 60)} minutes`);

/** The account id inside a role ARN, or undefined when it is not one. */
export const accountOfArn = (arn: string): string | undefined => ROLE_ARN.exec(arn.trim())?.[1];

export interface LinkDraft {
  readonly accountId: string;
  readonly roleArn: string;
  readonly profileName: string;
  readonly maxSessionSeconds: number;
}

/** The trust policy as the target account's owner pastes it, or undefined when the API gave none. */
export function trustPolicyText(l: RoleLinkRecord): string | undefined {
  return l.trustPolicy ? JSON.stringify(l.trustPolicy, null, 2) : undefined;
}

const POLL_MS = 2000;
const POLL_MAX = 10;

/** Cross-account role links and external identities (M4-I). The API decides access. */
export class IdentityUseCases {
  constructor(
    private readonly port: IdentityPort,
    private readonly clock: Pick<ClockPort, "setTimeout">,
  ) {}

  roleLinks(teamId: string, agentId: string, signal?: AbortSignal) {
    return this.port.roleLinks(teamId, agentId, signal);
  }
  linksForAgents(teamId: string, agentIds: readonly string[], signal?: AbortSignal) {
    return this.port.linksForAgents(teamId, agentIds, signal);
  }

  /**
   * *Add cross-account role*: only a dedicated agent, only an account inside the team's filter, a role ARN in that
   * account, a profile name and a session of 15 minutes to 12 hours. Returns the created link (with its trust policy).
   */
  async addRoleLink(
    teamId: string,
    agent: { id: string; iamIdentity: string },
    draft: LinkDraft,
    allowedAccountIds: readonly string[],
  ): Promise<RoleLinkRecord> {
    if (agent.iamIdentity !== "dedicated")
      throw invalid(
        "roleArn",
        "Only an agent with a dedicated role can assume roles in other accounts",
      );
    if (!allowedAccountIds.includes(draft.accountId))
      throw invalid("accountId", "Choose an account inside the team's filter");
    const arnAccount = accountOfArn(draft.roleArn);
    if (!arnAccount)
      throw invalid("roleArn", "Enter a role ARN such as arn:aws:iam::123456789012:role/name");
    if (arnAccount !== draft.accountId)
      throw invalid("roleArn", `The role must be in account ${draft.accountId}`);
    if (!PROFILE.test(draft.profileName.trim()))
      throw invalid("profileName", "Use letters, digits, - and _ (up to 64 characters)");
    if (draft.maxSessionSeconds < 900 || draft.maxSessionSeconds > 43200)
      throw invalid("maxSessionSeconds", "Choose 15 minutes to 12 hours");
    const input: RoleLinkInput = {
      roleArn: draft.roleArn.trim(),
      profileName: draft.profileName.trim(),
      maxSessionSeconds: draft.maxSessionSeconds,
    };
    const created = await this.port.createRoleLink(teamId, agent.id, input);
    // the create response may omit the trust policy; read the link for it
    return created.trustPolicy ? created : this.port.roleLink(teamId, agent.id, created.id);
  }
  roleLink(teamId: string, agentId: string, linkId: string, signal?: AbortSignal) {
    return this.port.roleLink(teamId, agentId, linkId, signal);
  }
  removeRoleLink(teamId: string, agentId: string, l: RoleLinkRecord) {
    return this.port.deleteRoleLink(teamId, agentId, { id: l.id, version: l.version });
  }
  /**
   * *Verify now*: the API accepts each verification (`202`) and assumes the role afterwards, so the links are read
   * until every one reports a new result, or for a bounded time. Returns the latest links.
   */
  async verifyAll(
    teamId: string,
    agentId: string,
    links: readonly RoleLinkRecord[],
  ): Promise<readonly RoleLinkRecord[]> {
    await Promise.all(links.map((l) => this.port.verifyRoleLink(teamId, agentId, l.id)));
    const sig = (l: RoleLinkRecord) => `${l.status}|${l.lastVerifiedAt ?? ""}|${l.version}`;
    const before = new Map(links.map((l) => [l.id, sig(l)]));
    let now: readonly RoleLinkRecord[] = links;
    for (let n = 0; n < POLL_MAX; n += 1) {
      await new Promise<void>((r) => this.clock.setTimeout(r, POLL_MS));
      now = await this.port.roleLinks(teamId, agentId);
      if (now.filter((l) => before.has(l.id)).every((l) => sig(l) !== before.get(l.id))) break;
    }
    return now;
  }

  identities(teamId: string, agentId: string, signal?: AbortSignal) {
    return this.port.identities(teamId, agentId, signal);
  }
  addIdentity(teamId: string, agentId: string, input: AgentIdentityInput) {
    if (!input.externalRef.trim())
      return Promise.reject(invalid("externalRef", "Enter the identifier of the identity"));
    return this.port.createIdentity(teamId, agentId, {
      ...input,
      externalRef: input.externalRef.trim(),
    });
  }
  removeIdentity(teamId: string, agentId: string, i: { id: string; version: number }) {
    return this.port.deleteIdentity(teamId, agentId, { id: i.id, version: i.version });
  }
}
