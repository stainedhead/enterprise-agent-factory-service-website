/**
 * A link from API data is rendered as an `href`, so only `https:` is kept (FR-020). `javascript:`, `data:`,
 * `http:`, relative and malformed values become `undefined`, which the screens render as "—".
 */
export function httpsUrlOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}
