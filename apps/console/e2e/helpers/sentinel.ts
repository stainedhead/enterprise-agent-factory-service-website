import type { ConsoleMessage, Page, Request } from "@playwright/test";

export interface Observed {
  readonly console: string[];
  readonly requests: { url: string; method: string; body: string | null }[];
}

/** Collects console output and every request the page makes, for the sentinel scan. */
export function observe(page: Page): Observed {
  const out: Observed = { console: [], requests: [] };
  page.on("console", (m: ConsoleMessage) => out.console.push(m.text()));
  page.on("pageerror", (e) => out.console.push(String(e)));
  page.on("request", (r: Request) =>
    out.requests.push({ url: r.url(), method: r.method(), body: r.postData() }),
  );
  return out;
}

export interface Hit {
  readonly where: string;
  readonly sentinel: string;
}

/**
 * Looks for any of `sentinels` (token values, a typed secret) everywhere the console could leak them: the
 * query and mutation cache (through the e2e hook), `localStorage`, `sessionStorage`, IndexedDB, cookies,
 * the URL and history state, console output, requests to anything other than the API and the IdP
 * (telemetry), and the DOM including attribute values. Returns the places that hold one.
 */
export async function scanForSentinels(
  page: Page,
  sentinels: readonly string[],
  observed: Observed,
  allowedOrigins: readonly string[],
): Promise<Hit[]> {
  const inPage = await page.evaluate(async () => {
    const dump = async (): Promise<Record<string, string>> => {
      const idb: string[] = [];
      try {
        for (const d of (await indexedDB.databases?.()) ?? []) {
          const db = await new Promise<IDBDatabase>((res, rej) => {
            const r = indexedDB.open(d.name as string);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
          });
          for (const name of Array.from(db.objectStoreNames)) {
            const rows = await new Promise<unknown[]>((res) => {
              const r = db.transaction(name).objectStore(name).getAll();
              r.onsuccess = () => res(r.result);
              r.onerror = () => res([]);
            });
            idb.push(JSON.stringify(rows));
          }
          db.close();
        }
      } catch {
        // IndexedDB unavailable: nothing to scan
      }
      const dom = [
        document.documentElement.outerHTML,
        ...Array.from(document.querySelectorAll("input,textarea")).map(
          (e) => (e as HTMLInputElement).value,
        ),
      ].join("\n");
      const hook = (window as unknown as { __afsE2E?: { cache(): string } }).__afsE2E;
      return {
        "query/mutation cache": hook ? hook.cache() : "",
        localStorage: JSON.stringify({ ...localStorage }),
        sessionStorage: JSON.stringify({ ...sessionStorage }),
        indexedDB: idb.join("\n"),
        cookies: document.cookie,
        url: location.href,
        "history state": JSON.stringify(history.state ?? null),
        dom,
      };
    };
    return dump();
  });
  const cookies = JSON.stringify(await page.context().cookies());
  const places: Record<string, string> = {
    ...inPage,
    "cookies (all)": cookies,
    console: observed.console.join("\n"),
    "telemetry requests": observed.requests
      .filter(
        (r) =>
          !allowedOrigins.some((o) => r.url.startsWith(o)) &&
          !r.url.startsWith("data:") &&
          !r.url.startsWith("blob:"),
      )
      .map((r) => `${r.url}\n${r.body ?? ""}`)
      .join("\n"),
  };
  const hits: Hit[] = [];
  for (const [where, text] of Object.entries(places)) {
    for (const s of sentinels)
      if (s && text.includes(s)) hits.push({ where, sentinel: `${s.slice(0, 6)}…` });
  }
  return hits;
}
