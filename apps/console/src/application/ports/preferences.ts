/** Non-secret per-browser preferences: provider id, table preferences, dismissed notices. */
export interface PreferencesPort {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface TablePreferences {
  pageSize?: number;
  hiddenColumns?: string[];
}

/** Reads table preferences through the port; malformed content yields no preferences. */
export function readTablePreferences(port: PreferencesPort, tableId: string): TablePreferences {
  const raw = port.get(`afs.table.${tableId}`);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as TablePreferences;
    return {
      ...(typeof v.pageSize === "number" && { pageSize: v.pageSize }),
      ...(Array.isArray(v.hiddenColumns) && {
        hiddenColumns: v.hiddenColumns.filter((c) => typeof c === "string"),
      }),
    };
  } catch {
    return {};
  }
}

export function writeTablePreferences(
  port: PreferencesPort,
  tableId: string,
  prefs: TablePreferences,
): void {
  port.set(`afs.table.${tableId}`, JSON.stringify(prefs));
}
