import { type AfsClient, adminExports, adminImports } from "@afs/sdk";
import type {
  AdminExportsPort,
  ExportRecord,
  ImportInput,
  ImportReportRecord,
} from "../../application/ports/adminExports.js";
import { toAppError } from "./errors.js";
import { httpsUrlOrUndefined } from "./safeUrl.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof adminExports>["get"]>>;

const toRecord = (e: Wire): ExportRecord => ({
  id: e.id,
  status: e.status,
  teamIds: e.teamIds ?? [],
  createdAt: e.createdAt,
  finishedAt: e.finishedAt ?? undefined,
  sizeBytes: e.sizeBytes ?? undefined,
  sha256: e.sha256 ?? undefined,
  downloadUrl: httpsUrlOrUndefined(e.downloadUrl),
  downloadExpiresAt: e.downloadExpiresAt ?? undefined,
  error: e.error ?? undefined,
});

/** `admin.exports.*` and `admin.imports.create` mapped to {@link AdminExportsPort}. */
export class SdkAdminExports implements AdminExportsPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal): Promise<readonly ExportRecord[]> {
    return wrap(async () => {
      const out: ExportRecord[] = [];
      for await (const e of adminExports(this.client).list({ maxResults: 100, ...sig(signal) }))
        out.push(toRecord(e));
      return out;
    });
  }
  create(teamIds: readonly string[]): Promise<ExportRecord> {
    return wrap(async () =>
      toRecord(
        await adminExports(this.client).create(teamIds.length > 0 ? { teamIds: [...teamIds] } : {}),
      ),
    );
  }
  get(id: string, signal?: AbortSignal): Promise<ExportRecord> {
    return wrap(async () => toRecord(await adminExports(this.client).get(id, sig(signal))));
  }
  importBundle(input: ImportInput, dryRun: boolean): Promise<ImportReportRecord> {
    return wrap(async () => {
      const r = await adminImports(this.client).create(
        {
          bundle: { ...input.bundle },
          ...(Object.keys(input.accountMap).length > 0 && { accountMap: { ...input.accountMap } }),
        },
        { dryRun },
      );
      return {
        dryRun: r.dryRun,
        teams: r.teams.map((t) => ({
          slug: t.slug,
          result: t.result,
          changes: t.changes,
          error: t.error ?? undefined,
        })),
      };
    });
  }
}
