import { type AfsClient, money, workOrders } from "@afs/sdk";
import type {
  CreateWorkOrderInput,
  RepoInput,
  WorkOrderDetail,
  WorkOrderFilters,
  WorkOrderRecord,
  WorkOrderRepoRecord,
  WorkOrdersPort,
} from "../../application/ports/workOrders.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof workOrders>["get"]>>;
type WireRepo = NonNullable<Wire["repos"]>[number];

const record = (w: Wire): WorkOrderRecord => ({
  id: w.id,
  title: w.title,
  severity: w.severity,
  status: w.status,
  slaState: w.slaState,
  slaDueAt: w.slaDueAt,
  teamId: w.teamId ?? null,
  kind: w.kind,
  cveId: w.cveId,
  templateId: w.templateId,
  budgetUsd: w.budgetUsd,
  progress: w.progress,
  cancelReason: w.cancelReason,
  createdAt: w.createdAt,
  version: w.version,
});

const repoRecord = (r: WireRepo): WorkOrderRepoRecord => ({
  host: r.host,
  repo: r.repo,
  status: r.status,
  owningTeamId: r.owningTeamId,
  owningContact: r.owningContact,
  ownerSource: r.ownerSource,
  prUrl: r.prUrl,
  prNumber: r.prNumber,
  detail: r.detail,
  notifications: (r.notifications ?? []).map((n) => ({
    kind: n.kind,
    recipient: n.recipient,
    sentAt: n.sentAt,
  })),
  version: r.version,
});

const repoBody = (r: RepoInput) => ({
  host: r.host,
  repo: r.repo,
  ...(r.owningTeamId && { owningTeamId: r.owningTeamId }),
  ...(r.owningContact && { owningContact: r.owningContact }),
});

const detail = (w: Wire): WorkOrderDetail => ({
  ...record(w),
  repos: (w.repos ?? []).map(repoRecord),
});

/** `workOrders.*` mapped to {@link WorkOrdersPort}. */
export class SdkWorkOrders implements WorkOrdersPort {
  constructor(private readonly client: AfsClient) {}

  listForTeam(teamId: string, q: { maxResults: number; signal?: AbortSignal }) {
    return wrap(async () => {
      const page = await workOrders(this.client)
        .listForTeam(teamId, { maxResults: q.maxResults, ...sig(q.signal) })
        .first();
      return { items: page.items.map(record), nextToken: page.nextToken };
    });
  }
  list(filters: WorkOrderFilters, limit: number, signal?: AbortSignal) {
    return wrap(async () => {
      const out: WorkOrderRecord[] = [];
      for await (const w of workOrders(this.client).list({
        maxResults: Math.min(limit, 100),
        ...(filters.status && { status: filters.status }),
        ...(filters.severity && { severity: filters.severity }),
        ...(filters.slaState && { slaState: filters.slaState }),
        ...(filters.teamId && { teamId: filters.teamId }),
        ...sig(signal),
      })) {
        out.push(record(w));
        if (out.length >= limit) break;
      }
      return out;
    });
  }
  create(input: CreateWorkOrderInput, idempotencyKey?: string) {
    return wrap(async () =>
      detail(
        await workOrders(this.client).create(
          {
            kind: input.kind,
            ...(input.cveId && { cveId: input.cveId }),
            severity: input.severity as "critical",
            title: input.title,
            slaDueAt: input.slaDueAt,
            templateId: input.templateId,
            ...(input.budgetUsd && { budgetUsd: money(input.budgetUsd) }),
            repos: input.repos.map(repoBody),
          },
          idempotencyKey ? { idempotencyKey } : {},
        ),
      ),
    );
  }
  get(id: string, signal?: AbortSignal) {
    return wrap(async () => detail(await workOrders(this.client).get(id, sig(signal))));
  }
  cancel(id: string, reason: string) {
    return wrap(async () => record(await workOrders(this.client).cancel(id, { reason })));
  }
  update(
    ref: { id: string; version?: number | undefined },
    input: {
      title?: string;
      budgetUsd?: string;
      slaDueAt?: string;
      addRepos?: readonly RepoInput[];
    },
  ) {
    return wrap(async () =>
      record(
        await workOrders(this.client).update(
          ref.version === undefined ? ref.id : { id: ref.id, version: ref.version },
          {
            ...(input.title && { title: input.title }),
            ...(input.budgetUsd && { budgetUsd: money(input.budgetUsd) }),
            ...(input.slaDueAt && { slaDueAt: input.slaDueAt }),
            ...(input.addRepos && { addRepos: input.addRepos.map(repoBody) }),
          },
        ),
      ),
    );
  }
  repos(id: string, signal?: AbortSignal) {
    return wrap(async () => {
      const out: WorkOrderRepoRecord[] = [];
      for await (const r of workOrders(this.client).repos.list(id, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(repoRecord(r));
      return out;
    });
  }
  updateRepo(
    id: string,
    repo: WorkOrderRepoRecord,
    input: { status: string; prUrl?: string; prNumber?: number; detail?: string },
  ) {
    const [owner, name] = repo.repo.split("/") as [string, string];
    return wrap(async () =>
      repoRecord(
        await workOrders(this.client).repos.update(
          id,
          repo.host,
          owner,
          repo.version === undefined ? name : { id: name, version: repo.version },
          {
            status: input.status as "pending",
            ...(input.prUrl && { prUrl: input.prUrl }),
            ...(input.prNumber && { prNumber: input.prNumber }),
            ...(input.detail && { detail: input.detail }),
          },
        ),
      ),
    );
  }
}
