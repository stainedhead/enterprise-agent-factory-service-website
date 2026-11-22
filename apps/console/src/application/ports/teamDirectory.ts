// `ListTeamDirectory`: every team's id, slug and name, readable by security operators (D38).

export interface TeamDirectoryEntry {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

export interface TeamDirectoryPort {
  list(signal?: AbortSignal): Promise<readonly TeamDirectoryEntry[]>;
}
