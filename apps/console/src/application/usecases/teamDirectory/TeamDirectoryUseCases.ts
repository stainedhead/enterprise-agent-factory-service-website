import type { TeamDirectoryEntry, TeamDirectoryPort } from "../../ports/teamDirectory.js";

/** The name a team goes by in a picker: `Payments (payments)`. */
export const directoryLabel = (t: TeamDirectoryEntry): string => `${t.displayName} (${t.slug})`;

/** Use cases over the team directory (owner pickers, team names in tables). */
export class TeamDirectoryUseCases {
  constructor(private readonly port: TeamDirectoryPort) {}

  async list(signal?: AbortSignal): Promise<readonly TeamDirectoryEntry[]> {
    return [...(await this.port.list(signal))].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }
}
