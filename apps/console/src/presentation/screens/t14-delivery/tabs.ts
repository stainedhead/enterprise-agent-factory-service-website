// Shared list: one entry per tab, added by the owning stream. Empty until then.
export interface TabDef {
  readonly id: string;
  readonly label: string;
}
export const tabs: readonly TabDef[] = [];
