import { AfsClient } from "@afs/sdk";

export interface Recorded {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: unknown;
}

export type Handler = (req: Recorded) => Response | undefined;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** A client over a fake `fetch`: handlers answer by request; every request is recorded (no network). */
export function fakeApi(...handlers: Handler[]): { client: AfsClient; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const client = new AfsClient({
    endpoint: "http://api.test",
    retry: { maxRetries: 0 },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : undefined;
      const url = new URL(String(req ? req.url : input));
      const raw = req ? await req.text() : init?.body;
      const rec: Recorded = {
        method: (req?.method ?? init?.method ?? "GET").toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        headers: new Headers(req?.headers ?? init?.headers),
        body: typeof raw === "string" && raw !== "" ? JSON.parse(raw) : undefined,
      };
      calls.push(rec);
      for (const h of handlers) {
        const r = h(rec);
        if (r) return r;
      }
      return json({ code: "NotFound", message: `unhandled ${rec.method} ${rec.path}` }, 404);
    }) as typeof fetch,
  });
  return { client, calls };
}

/** Matches a method and path (with `*` for one path segment). */
export const on =
  (method: string, pattern: string, respond: (req: Recorded) => Response): Handler =>
  (req) => {
    const re = new RegExp(`^${pattern.replace(/\*/g, "[^/]+").replace(/:/g, "\\:")}$`);
    return req.method === method && re.test(req.path) ? respond(req) : undefined;
  };
