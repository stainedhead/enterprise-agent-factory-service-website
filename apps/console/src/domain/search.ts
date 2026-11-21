export type SearchType = "team" | "agent" | "pool" | "work-order";

export interface SearchEntry {
  readonly type: SearchType;
  readonly id: string;
  readonly label: string;
  readonly route: string;
}

export interface SearchGroup {
  readonly type: SearchType;
  readonly entries: readonly SearchEntry[];
}

const ORDER: SearchType[] = ["team", "agent", "pool", "work-order"];
export const MIN_QUERY = 2;
export const MAX_RESULTS = 10;

/** Filters `index` by `query` (≥ 2 chars): at most 10 matches in total, grouped by type, stable order. */
export function filterSearch(index: readonly SearchEntry[], query: string): SearchGroup[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY) return [];
  const matches = index.filter(
    (e) => e.label.toLowerCase().includes(q) || e.id.toLowerCase().includes(q),
  );
  const groups: SearchGroup[] = [];
  let remaining = MAX_RESULTS;
  for (const type of ORDER) {
    const entries = matches.filter((m) => m.type === type).slice(0, remaining);
    if (entries.length === 0) continue;
    remaining -= entries.length;
    groups.push({ type, entries });
    if (remaining === 0) break;
  }
  return groups;
}
