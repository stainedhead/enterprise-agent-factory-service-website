import { type AfsClient, teams } from "@afs/sdk";
import type { TagsPort, TeamTagsView } from "../../application/ports/tags.js";
import { toAppError } from "./errors.js";

const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof teams>["tags"]["get"]>>;
const view = (r: Wire): TeamTagsView => ({
  tags: r.tags.map((t) => ({ key: t.key, source: t.source, value: t.value })),
  droppedKeys: r.requestMetadataDroppedKeys ?? [],
  version: r.version,
});

/** `teams.tags.get` and `teams.tags.put` mapped to {@link TagsPort}. */
export class SdkTags implements TagsPort {
  constructor(private readonly client: AfsClient) {}

  get(teamId: string, signal?: AbortSignal): Promise<TeamTagsView> {
    return wrap(async () =>
      view(await teams(this.client).tags.get(teamId, signal ? { signal } : {})),
    );
  }
  put(
    teamId: string,
    version: number | undefined,
    tags: readonly { key: string; value: string }[],
  ): Promise<TeamTagsView> {
    return wrap(async () =>
      view(
        await teams(this.client).tags.put(
          version === undefined ? teamId : { id: teamId, version },
          { tags: tags.map((t) => ({ ...t })) },
        ),
      ),
    );
  }
}
