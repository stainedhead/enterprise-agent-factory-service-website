import { compare, parse } from "../../../domain/money.js";
import { AppError } from "../../errors.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  CreateTeamInput,
  ListTeamsQuery,
  TeamPage,
  TeamRecord,
  TeamRef,
  TeamSpend,
  TeamsPort,
  UpdateTeamInput,
} from "../../ports/teams.js";
import { type TeamDraft, toCreateInput } from "./teamDraft.js";

/** A row of the S2 table: the team plus its month-to-date spend. */
export interface TeamRow {
  readonly team: TeamRecord;
  readonly spend: TeamSpend | undefined;
}

export interface TeamRowsPage {
  readonly rows: readonly TeamRow[];
  readonly nextToken?: string | undefined;
}

export interface RaiseCeilingInput {
  readonly amountUsd: string;
  readonly expiresAt: string;
  readonly reason: string;
}

const refOf = (t: TeamRef): TeamRef => ({ id: t.id, version: t.version });
const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/**
 * The team use cases (M1-T1..T7). Each method is one use case; they share the port and the clock, so
 * they live in one class (DV-11).
 */
export class TeamsUseCases {
  constructor(
    private readonly port: TeamsPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  /** One page of teams joined with spend: two requests per page, never one per row (WEB-US-13.1). */
  async listRows(q: ListTeamsQuery): Promise<TeamRowsPage> {
    const [page, spend]: [TeamPage, Readonly<Record<string, TeamSpend>>] = await Promise.all([
      this.port.list(q),
      // spend is informational: a failing report must not blank the table
      this.port.spendByTeam(q.signal).catch(() => ({}) as Record<string, TeamSpend>),
    ]);
    return {
      rows: page.items.map((team) => ({ team, spend: spend[team.id] })),
      nextToken: page.nextToken,
    };
  }

  get(id: string, signal?: AbortSignal): Promise<TeamRecord> {
    return this.port.get(id, signal);
  }
  status(id: string, signal?: AbortSignal) {
    return this.port.status(id, signal);
  }
  update(ref: TeamRef, patch: UpdateTeamInput): Promise<TeamRecord> {
    return this.port.update(refOf(ref), patch);
  }
  suspend(id: string): Promise<TeamRecord> {
    return this.port.suspend(id);
  }
  resume(id: string): Promise<TeamRecord> {
    return this.port.resume(id);
  }
  delete(ref: TeamRef): Promise<TeamRecord> {
    return this.port.delete(refOf(ref));
  }
  models(id: string, signal?: AbortSignal) {
    return this.port.models(id, signal);
  }
  putModels(ref: TeamRef, ids: readonly string[]) {
    return this.port.putModels(refOf(ref), ids);
  }
  tags(id: string, signal?: AbortSignal) {
    return this.port.tags(id, signal);
  }
  catalogModels(signal?: AbortSignal) {
    return this.port.catalogModels(signal);
  }
  serviceTags(signal?: AbortSignal) {
    return this.port.serviceTags(signal);
  }

  /** *Set ceiling*: the API refuses a value below the budget with a `ValidationError` (shown as is). */
  setCeiling(ref: TeamRef, maxBudgetUsd: string): Promise<TeamRecord> {
    try {
      if (compare(maxBudgetUsd, "0") <= 0) throw new Error();
    } catch {
      return Promise.reject(invalid("maxBudgetUsd", "Enter an amount above zero, such as 6000.00"));
    }
    return this.port.update(refOf(ref), { maxBudgetUsd });
  }

  /** *Raise ceiling temporarily* (D34): an amount, an expiry in the future and a reason. */
  raiseCeilingTemporarily(ref: TeamRef, input: RaiseCeilingInput): Promise<TeamRecord> {
    try {
      parse(input.amountUsd);
    } catch {
      return Promise.reject(invalid("ceilingOverrideUsd", "Enter an amount such as 7500.00"));
    }
    const at = Date.parse(input.expiresAt);
    if (Number.isNaN(at) || at <= this.clock.now())
      return Promise.reject(invalid("ceilingOverrideExpiresAt", "Choose a time in the future"));
    if (input.reason.trim() === "")
      return Promise.reject(
        invalid("ceilingOverrideReason", "Enter a reason; it goes to the audit log"),
      );
    return this.port.update(refOf(ref), {
      ceilingOverrideUsd: input.amountUsd,
      ceilingOverrideExpiresAt: input.expiresAt,
      ceilingOverrideReason: input.reason.trim(),
    });
  }

  /** S3 *Create*: validates the draft's budget and sends `CreateTeam`. */
  create(draft: TeamDraft): Promise<TeamRecord> {
    let input: CreateTeamInput;
    try {
      input = toCreateInput(draft);
    } catch {
      return Promise.reject(invalid("maxBudgetUsd", "Enter an amount such as 5000.00"));
    }
    return this.port.create(input);
  }
}

/** True while a team's temporary ceiling is in effect. */
export function overrideActive(t: TeamRecord, now: number): boolean {
  return (
    t.ceilingOverrideUsd != null &&
    (t.ceilingOverrideExpiresAt == null || Date.parse(t.ceilingOverrideExpiresAt) > now)
  );
}
