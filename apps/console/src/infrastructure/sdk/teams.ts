import { type AfsClient, adminServiceTags, models, money, reports, teams } from "@afs/sdk";
import type {
  CreateTeamInput,
  ListTeamsQuery,
  ModelRecord,
  ServiceTagRecord,
  StatusRecord,
  TeamPage,
  TeamRecord,
  TeamRef,
  TeamSpend,
  TeamsPort,
  TeamTagsRecord,
  UpdateTeamInput,
} from "../../application/ports/teams.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const m = (v: string | null | undefined) => (v == null ? v : money(v));

const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

const modelRecord = (x: {
  id: string;
  displayName: string;
  provider: string;
  enabled: boolean;
}): ModelRecord => ({
  id: x.id,
  displayName: x.displayName,
  provider: x.provider,
  enabled: x.enabled,
});

/** `teams.*` calls mapped to {@link TeamsPort}; SDK errors become `AppError`. */
export class SdkTeams implements TeamsPort {
  constructor(private readonly client: AfsClient) {}

  list(q: ListTeamsQuery): Promise<TeamPage> {
    return wrap(async () => {
      const page = await teams(this.client)
        .list({
          maxResults: q.maxResults,
          ...(q.nextToken !== undefined && { nextToken: q.nextToken }),
          ...(q.state && { state: q.state }),
          ...(q.kind && { kind: q.kind }),
          ...sig(q.signal),
        })
        .first();
      return { items: page.items as TeamRecord[], nextToken: page.nextToken };
    });
  }
  get(id: string, signal?: AbortSignal): Promise<TeamRecord> {
    return wrap(() => teams(this.client).get(id, sig(signal)));
  }
  create(input: CreateTeamInput): Promise<TeamRecord> {
    return wrap(() =>
      teams(this.client).create({
        displayName: input.displayName,
        slug: input.slug,
        kind: input.kind,
        maxBudgetUsd: money(input.maxBudgetUsd),
        ...(input.costCenter !== undefined && { costCenter: input.costCenter }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.ownerEmail !== undefined && { ownerEmail: input.ownerEmail }),
        ...(input.identityProviderId !== undefined && {
          identityProviderId: input.identityProviderId,
        }),
        ...(input.models && { models: [...input.models] }),
        ...(input.tags && { tags: input.tags.map((t) => ({ ...t })) }),
        ...(input.budget && {
          budget: {
            amountUsd: money(input.budget.amountUsd),
            ...(input.budget.thresholds && { thresholds: [...input.budget.thresholds] }),
          },
        }),
        firstAdmin: { ...input.firstAdmin },
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
        ...(input.teardownRule !== undefined && { teardownRule: input.teardownRule }),
        ...(input.isolationTier !== undefined && { isolationTier: input.isolationTier }),
        ...(input.viewerKubectl !== undefined && { viewerKubectl: input.viewerKubectl }),
        ...(input.mayAddExternalSystems !== undefined && {
          mayAddExternalSystems: input.mayAddExternalSystems,
        }),
        ...(input.mayManageAwsAccounts !== undefined && {
          mayManageAwsAccounts: input.mayManageAwsAccounts,
        }),
      }),
    );
  }
  update(ref: TeamRef, p: UpdateTeamInput): Promise<TeamRecord> {
    return wrap(() =>
      teams(this.client).update(
        { id: ref.id, version: ref.version },
        {
          ...(p.displayName !== undefined && { displayName: p.displayName }),
          ...(p.description !== undefined && { description: p.description }),
          ...(p.ownerEmail !== undefined && { ownerEmail: p.ownerEmail }),
          ...(p.costCenter !== undefined && { costCenter: p.costCenter }),
          ...(p.identityProviderId !== undefined && { identityProviderId: p.identityProviderId }),
          ...(p.maxBudgetUsd !== undefined && { maxBudgetUsd: money(p.maxBudgetUsd) }),
          ...(p.ceilingOverrideUsd !== undefined && {
            ceilingOverrideUsd: m(p.ceilingOverrideUsd) as ReturnType<typeof money> | null,
          }),
          ...(p.ceilingOverrideExpiresAt !== undefined && {
            ceilingOverrideExpiresAt: p.ceilingOverrideExpiresAt,
          }),
          ...(p.ceilingOverrideReason !== undefined && {
            ceilingOverrideReason: p.ceilingOverrideReason,
          }),
          ...(p.isolationTier !== undefined && { isolationTier: p.isolationTier }),
          ...(p.viewerKubectl !== undefined && { viewerKubectl: p.viewerKubectl }),
          ...(p.mayAddExternalSystems !== undefined && {
            mayAddExternalSystems: p.mayAddExternalSystems,
          }),
          ...(p.mayManageAwsAccounts !== undefined && {
            mayManageAwsAccounts: p.mayManageAwsAccounts,
          }),
          ...(p.quotas !== undefined && { quotas: { ...p.quotas } }),
        },
      ),
    );
  }
  delete(ref: TeamRef): Promise<TeamRecord> {
    return wrap(() => teams(this.client).delete({ id: ref.id, version: ref.version }));
  }
  suspend(id: string): Promise<TeamRecord> {
    return wrap(() => teams(this.client).suspend(id));
  }
  resume(id: string): Promise<TeamRecord> {
    return wrap(() => teams(this.client).resume(id));
  }
  status(id: string, signal?: AbortSignal): Promise<StatusRecord> {
    return wrap(async () => (await teams(this.client).getStatus(id, sig(signal))).status);
  }
  models(id: string, signal?: AbortSignal): Promise<readonly ModelRecord[]> {
    return wrap(async () =>
      (await teams(this.client).models.list(id, sig(signal))).items.map(modelRecord),
    );
  }
  putModels(ref: TeamRef, modelIds: readonly string[]): Promise<readonly ModelRecord[]> {
    return wrap(async () =>
      // the models list has no version of its own: the SDK reads the current one first
      (await teams(this.client).models.put(ref.id, { modelIds: [...modelIds] })).items.map(
        modelRecord,
      ),
    );
  }
  tags(id: string, signal?: AbortSignal): Promise<TeamTagsRecord> {
    return wrap(() => teams(this.client).tags.get(id, sig(signal)));
  }
  putTags(ref: TeamRef, tags: readonly { key: string; value: string }[]): Promise<TeamTagsRecord> {
    return wrap(() =>
      teams(this.client).tags.put(
        { id: ref.id, version: ref.version },
        { tags: tags.map((t) => ({ ...t })) },
      ),
    );
  }
  catalogModels(signal?: AbortSignal): Promise<readonly ModelRecord[]> {
    return wrap(async () => {
      const out: ModelRecord[] = [];
      for await (const x of models(this.client).list(sig(signal))) out.push(modelRecord(x));
      return out;
    });
  }
  serviceTags(signal?: AbortSignal): Promise<readonly ServiceTagRecord[]> {
    return wrap(async () => {
      const out: ServiceTagRecord[] = [];
      for await (const x of adminServiceTags(this.client).list(sig(signal))) out.push(x);
      return out;
    });
  }
  spendByTeam(signal?: AbortSignal): Promise<Readonly<Record<string, TeamSpend>>> {
    return wrap(async () => {
      const r = await reports(this.client).service("usage", {
        range: "mtd",
        groupBy: "team",
        ...sig(signal),
      });
      const out: Record<string, TeamSpend> = {};
      for (const row of r.rows) {
        const id = row.team;
        const cost = row.costUsd;
        if (typeof id === "string" && typeof cost === "string")
          out[id] = {
            costUsd: cost,
            ...(typeof row.calls === "number" && { calls: row.calls }),
          };
      }
      return out;
    });
  }
}
