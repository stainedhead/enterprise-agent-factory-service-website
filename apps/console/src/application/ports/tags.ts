// The team tags port (M4-G): `GetTeamTags` and `PutTeamTags`. A write sends the team-owned keys only.

export type TagSource =
  | "system"
  | "service"
  | "team"
  | "service_default"
  | "missing"
  | (string & {});

export interface TagEntry {
  readonly key: string;
  readonly source: TagSource;
  readonly value: string | undefined;
}

export interface TeamTagsView {
  readonly tags: readonly TagEntry[];
  /** Keys left out of Bedrock request metadata because of its pair limit (D27). */
  readonly droppedKeys: readonly string[];
  readonly version: number | undefined;
}

export interface TagsPort {
  get(teamId: string, signal?: AbortSignal): Promise<TeamTagsView>;
  put(
    teamId: string,
    version: number | undefined,
    tags: readonly { key: string; value: string }[],
  ): Promise<TeamTagsView>;
}
