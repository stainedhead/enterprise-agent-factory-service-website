/** Query key convention (architecture §3.3): `[area, teamId?, resource, id?, params?]`. */
export type QueryKey = readonly unknown[];

export interface KeyParts {
  readonly area: string;
  readonly teamId?: string | undefined;
  readonly resource: string;
  readonly id?: string | undefined;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}

/** Builds a key; absent parts are omitted so a prefix invalidates everything below it. */
export function queryKey(p: KeyParts): QueryKey {
  const out: unknown[] = [p.area];
  if (p.teamId !== undefined) out.push(p.teamId);
  out.push(p.resource);
  if (p.id !== undefined) out.push(p.id);
  if (p.params !== undefined) out.push(p.params);
  return out;
}

/** Key prefix for everything of an area (optionally one team). */
export const areaKey = (area: string, teamId?: string): QueryKey =>
  teamId === undefined ? [area] : [area, teamId];
