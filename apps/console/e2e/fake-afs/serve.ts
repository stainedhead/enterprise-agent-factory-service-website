// Starts the fake AFS API and the fake IdP for Playwright: `bun e2e/fake-afs/serve.ts`.

import { serveFetch } from "./http.js";
import { FakeIdp } from "./idp.js";
import { FakeAfs } from "./server.js";

const apiPort = Number(process.env.FAKE_AFS_PORT ?? 4400);
const idpPort = Number(process.env.FAKE_IDP_PORT ?? 4401);
const idpIssuer = `http://127.0.0.1:${idpPort}`;

const api = new FakeAfs({ idpIssuer });
const idp = new FakeIdp({ issuer: idpIssuer });

// Control endpoints (tests only): reset, inject failures, change the IdP's behaviour, read the recorder.
const control = async (req: Request, url: URL): Promise<Response | undefined> => {
  const ok = (body: unknown = { ok: true }) =>
    Response.json(body, { headers: { "access-control-allow-origin": "*" } });
  if (!url.pathname.startsWith("/__")) return undefined;
  if (url.pathname === "/__reset") {
    api.reset();
    idp.revokeAll();
    idp.setTtl(300);
    idp.setRefreshTokens(true);
    return ok();
  }
  if (url.pathname === "/__recorded") return ok(api.recorded);
  if (url.pathname === "/__inject") {
    api.inject((await req.json()) as never);
    return ok();
  }
  if (url.pathname === "/__contract-version") {
    api.contractVersion = String(url.searchParams.get("v"));
    return ok();
  }
  if (url.pathname === "/__idp") {
    const q = url.searchParams;
    if (q.get("user")) idp.signInAs(q.get("user") as string);
    if (q.get("ttl")) idp.setTtl(Number(q.get("ttl")));
    if (q.get("refresh")) idp.setRefreshTokens(q.get("refresh") === "on");
    if (q.get("revoke")) idp.revokeAll();
    return ok({ requests: idp.requests.length });
  }
  return undefined;
};

await serveFetch(apiPort, async (req) => (await control(req, new URL(req.url))) ?? api.handle(req));
await serveFetch(idpPort, async (req) => (await control(req, new URL(req.url))) ?? idp.handle(req));
console.log(`fake AFS on :${apiPort}, fake IdP on :${idpPort}`);
