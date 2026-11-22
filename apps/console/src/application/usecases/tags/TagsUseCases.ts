import { AppError } from "../../errors.js";
import type { TagSource, TagsPort, TeamTagsView } from "../../ports/tags.js";
import { keyProblem } from "../adminServiceTags/AdminServiceTagsUseCases.js";

/** One line of the T13 table while it is being edited. */
export interface TagRow {
  readonly key: string;
  readonly source: TagSource;
  readonly value: string;
  /** The value as read; a change is what makes a defaulted or missing value a team value. */
  readonly original: string;
  readonly isNew: boolean;
}

const MAX_VALUE = 256;

/** What a team role may do to a row of its tags (WEB-US-33.1). */
export function rowAccess(source: TagSource): "read-only" | "value" | "own" {
  if (source === "system" || source === "service") return "read-only";
  if (source === "missing" || source === "service_default") return "value";
  return "own";
}

export const SOURCE_LABEL: Readonly<Record<string, string>> = {
  system: "System",
  service: "Service (fixed)",
  team: "Team",
  service_default: "Service default",
  missing: "Required, not set",
};

export const toRows = (v: TeamTagsView): TagRow[] =>
  v.tags.map((t) => ({
    key: t.key,
    source: t.source,
    value: t.value ?? "",
    original: t.value ?? "",
    isNew: false,
  }));

/** The team-owned entries a write sends: team tags and required values the team has now set. */
export function toWrite(rows: readonly TagRow[]): { key: string; value: string }[] {
  return rows
    .filter((r) => {
      const a = rowAccess(r.source);
      if (a === "own") return true;
      if (a === "value") return r.value.trim() !== "" && r.value !== r.original;
      return false;
    })
    .map((r) => ({ key: r.key.trim(), value: r.value.trim() }));
}

/** Team tags for T13 (M4-G). The API decides access; this keeps system and fixed tags out of writes. */
export class TagsUseCases {
  constructor(private readonly port: TagsPort) {}

  get(teamId: string, signal?: AbortSignal) {
    return this.port.get(teamId, signal);
  }

  /** Field messages by row index, or none. */
  check(rows: readonly TagRow[]): Record<number, string> {
    const out: Record<number, string> = {};
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const k = r.key.trim().toLowerCase();
      if (r.isNew) {
        const p = keyProblem(r.key);
        if (p) out[i] = p;
        else if (
          seen.has(k) ||
          rows.some((o, j) => j !== i && !o.isNew && o.key.toLowerCase() === k)
        )
          out[i] = "This key is already used";
      }
      seen.add(k);
      if (!out[i] && rowAccess(r.source) !== "read-only" && r.value.length > MAX_VALUE)
        out[i] = `Use at most ${MAX_VALUE} characters`;
      if (!out[i] && r.isNew && r.value.trim() === "") out[i] = "Enter a value";
    });
    return out;
  }

  save(teamId: string, version: number | undefined, rows: readonly TagRow[]) {
    const problems = this.check(rows);
    const first = Object.entries(problems)[0];
    if (first)
      return Promise.reject(
        new AppError({
          kind: "validation",
          message: first[1],
          fields: { [`row${first[0]}`]: first[1] },
        }),
      );
    return this.port.put(teamId, version, toWrite(rows));
  }
}
