// Times show in the browser's time zone; the UTC instant is the hover text.
/** Local display, for example "21 Nov 2026, 18:00". */
export function formatLocal(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone && { timeZone }),
  }).format(d);
}

/** Hover text: the UTC instant, for example "2026-11-21T18:00:00Z". */
export function utcTitle(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().replace(/\.\d{3}Z$/, "Z")} (UTC)`;
}
