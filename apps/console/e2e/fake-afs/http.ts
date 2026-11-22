import { createServer, type Server } from "node:http";

/** Serves a fetch-style handler on `node:http` (works under Bun and Node without extra types). */
export function serveFetch(
  port: number,
  handler: (req: Request) => Promise<Response>,
): Promise<Server> {
  const server = createServer(async (nodeReq, nodeRes) => {
    const chunks: Buffer[] = [];
    for await (const c of nodeReq) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = `http://${nodeReq.headers.host ?? `127.0.0.1:${port}`}${nodeReq.url ?? "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(nodeReq.headers))
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const method = nodeReq.method ?? "GET";
    const res = await handler(
      new Request(url, {
        method,
        headers,
        ...(method === "GET" || method === "HEAD" ? {} : { body }),
      }),
    ).catch((e: unknown) => new Response(String(e), { status: 500 }));
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      out[k] = v;
    });
    nodeRes.writeHead(res.status, out);
    nodeRes.end(Buffer.from(await res.arrayBuffer()));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
