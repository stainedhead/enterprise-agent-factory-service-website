import { type AfsClient, teams } from "@afs/sdk";
import type { TeamDirectoryPort } from "../../application/ports/teamDirectory.js";
import { toAppError } from "./errors.js";

/** `teams.directory.list` mapped to {@link TeamDirectoryPort}. */
export class SdkTeamDirectory implements TeamDirectoryPort {
  constructor(private readonly client: AfsClient) {}

  async list(signal?: AbortSignal) {
    try {
      const out: { id: string; slug: string; displayName: string }[] = [];
      for await (const t of teams(this.client).directory.list({
        maxResults: 100,
        ...(signal ? { signal } : {}),
      }))
        out.push({ id: t.id, slug: t.slug, displayName: t.displayName });
      return out;
    } catch (e) {
      throw toAppError(e);
    }
  }
}
