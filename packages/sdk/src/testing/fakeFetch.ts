// Test helper (not exported from the package): a route-table fetch that records requests.
export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
  bodyText: string;
}

export type Reply =
  | Response
  | {
      status?: number;
      body?: unknown;
      text?: string;
      headers?: Record<string, string>;
    }
  | Error;

export type Handler = Reply | ((req: RecordedRequest, n: number) => Reply | Promise<Reply>);

export interface FakeFetch {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  /** Registers a route; `"GET /v1/teams/team_1"`. Later registrations for the same key are used after earlier ones are exhausted when given as arrays. */
  on(route: string, handler: Handler | Handler[]): FakeFetch;
}

function toResponse(r: Exclude<Reply, Error>): Response {
  if (r instanceof Response) return r;
  const status = r.status ?? 200;
  const headers = new Headers(r.headers);
  if (status === 204) return new Response(null, { status, headers });
  if (r.text !== undefined) return new Response(r.text, { status, headers });
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(r.body ?? {}), { status, headers });
}

/** Creates a fake fetch. Unmatched requests fail the test with a clear message. */
export function fakeFetch(): FakeFetch {
  const routes = new Map<string, { handlers: Handler[]; calls: number }>();
  const requests: RecordedRequest[] = [];
  const self: FakeFetch = {
    requests,
    on(route, handler) {
      routes.set(route, { handlers: Array.isArray(handler) ? handler : [handler], calls: 0 });
      return self;
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = (init?.method ?? "GET").toUpperCase();
      const bodyText = typeof init?.body === "string" ? init.body : "";
      const req: RecordedRequest = {
        method,
        url: url.href,
        path: url.pathname,
        query: url.searchParams,
        headers: new Headers(init?.headers),
        body: bodyText ? JSON.parse(bodyText) : undefined,
        bodyText,
      };
      requests.push(req);
      if (init?.signal?.aborted) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      const entry = routes.get(`${method} ${url.pathname}`);
      if (!entry) throw new Error(`fakeFetch: no route for ${method} ${url.pathname}`);
      const h = entry.handlers[Math.min(entry.calls, entry.handlers.length - 1)] as Handler;
      const n = entry.calls++;
      const reply = typeof h === "function" ? await h(req, n) : h;
      if (reply instanceof Error) throw reply;
      return toResponse(reply);
    }) as typeof fetch,
  };
  return self;
}
