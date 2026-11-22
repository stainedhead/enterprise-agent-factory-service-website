// Shared list: one line per search source (teams in M0; agents, pools and work orders by their streams).
export interface SearchSourceDef {
  readonly type: "team" | "agent" | "pool" | "work-order";
}
export const searchSources: readonly SearchSourceDef[] = [{ type: "team" }];
