import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { ENDPOINTS } from "./control.js";

interface Policy {
  headers: Record<string, string>;
}
const policy = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "..", "deploy", "response-headers-policy.json"),
    "utf8",
  ),
) as Policy;

/** The headers of `deploy/response-headers-policy.json` with the placeholders filled from the e2e endpoints. */
export function deployHeaders(): Record<string, string> {
  const fill = (v: string) =>
    v
      .replaceAll("<apiUrl>", ENDPOINTS.api)
      .replaceAll("<issuers>", ENDPOINTS.idp)
      .replaceAll(" <telemetryUrl>", "");
  return Object.fromEntries(Object.entries(policy.headers).map(([k, v]) => [k, fill(v)]));
}

/**
 * A tiny reverse proxy in front of the e2e build that adds the deploy headers to every response, the way the
 * distribution does (M6-Q6). A Playwright route cannot do this: a fulfilled document loses its address space
 * and Chromium then blocks its requests to loopback. Returns the origin and a stop function.
 */
export async function serveWithDeployHeaders(
  upstream: string,
): Promise<{ origin: string; port: number; stop: () => Promise<void> }> {
  const headers = deployHeaders();
  const server = createServer(async (req, res) => {
    const r = await fetch(new URL(req.url ?? "/", upstream), { method: req.method ?? "GET" });
    const out: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k))
        out[k] = v;
    });
    res.writeHead(r.status, { ...out, ...headers });
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    stop: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}

/** Records every Content Security Policy violation the page reports. Returns the list the page fills in. */
export async function recordCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ""}`);
    });
  });
  page.on("console", (m) => {
    const t = m.text();
    if (t.startsWith("CSP-VIOLATION") || /Content Security Policy/i.test(t)) violations.push(t);
  });
  return violations;
}
