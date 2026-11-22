import { type AfsClient, adminServiceTags, teams } from "@afs/sdk";
import type {
  AdminServiceTagsPort,
  MissingTagTeam,
  ServiceTagInput,
  ServiceTagItem,
} from "../../application/ports/adminServiceTags.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

const item = (t: {
  key: string;
  mode: string;
  value?: string | null;
  defaultValue?: string | null;
  allowedValues?: string[] | null;
  description?: string;
  version?: number;
}): ServiceTagItem => ({
  key: t.key,
  mode: t.mode,
  value: t.value,
  defaultValue: t.defaultValue,
  allowedValues: t.allowedValues,
  description: t.description,
  version: t.version,
});

const body = (i: ServiceTagInput) => ({
  mode: i.mode,
  ...(i.value !== undefined && { value: i.value }),
  ...(i.defaultValue !== undefined && { defaultValue: i.defaultValue }),
  ...(i.allowedValues !== undefined && { allowedValues: [...i.allowedValues] }),
  ...(i.description !== undefined && { description: i.description }),
});

const MAX_TEAMS = 200;
const BATCH = 10;

/**
 * `admin.serviceTags.*` mapped to {@link AdminServiceTagsPort}. There is no operation listing the teams that miss
 * a required value (CQ-20), so each team's tags are read and the `missing` ones collected.
 */
export class SdkAdminServiceTags implements AdminServiceTagsPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal): Promise<readonly ServiceTagItem[]> {
    return wrap(async () => {
      const out: ServiceTagItem[] = [];
      for await (const t of adminServiceTags(this.client).list({ maxResults: 100, ...sig(signal) }))
        out.push(item(t));
      return out;
    });
  }
  put(key: string, version: number | undefined, input: ServiceTagInput): Promise<ServiceTagItem> {
    return wrap(async () =>
      item(
        await adminServiceTags(this.client).put(
          version === undefined ? key : { key, version },
          body(input),
        ),
      ),
    );
  }
  delete(key: string, version: number | undefined): Promise<void> {
    return wrap(() =>
      adminServiceTags(this.client).delete(version === undefined ? key : { key, version }),
    );
  }
  teamsMissing(keys: readonly string[], signal?: AbortSignal): Promise<readonly MissingTagTeam[]> {
    return wrap(async () => {
      if (keys.length === 0) return [];
      const all: { id: string; displayName: string }[] = [];
      for await (const t of teams(this.client).list({ maxResults: 100, ...sig(signal) })) {
        if (all.length >= MAX_TEAMS) break;
        if (t.state !== "deleted" && t.state !== "deleting")
          all.push({ id: t.id, displayName: t.displayName });
      }
      const out: MissingTagTeam[] = [];
      for (let i = 0; i < all.length; i += BATCH)
        await Promise.all(
          all.slice(i, i + BATCH).map(async (t) => {
            const r = await teams(this.client).tags.get(t.id, sig(signal));
            const missing = r.tags
              .filter((x) => x.source === "missing" && keys.includes(x.key))
              .map((x) => x.key);
            if (missing.length > 0)
              out.push({ teamId: t.id, displayName: t.displayName, keys: missing });
          }),
        );
      return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    });
  }
}
