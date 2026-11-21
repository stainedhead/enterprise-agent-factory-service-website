import { describe, expect, it } from "vitest";
import { FakeIdp } from "../../../e2e/fake-afs/idp.js";
import { CompleteSignIn } from "../../application/usecases/session/CompleteSignIn.js";
import { Session } from "../../application/usecases/session/Session.js";
import { SessionFlowStore } from "../storage/SessionFlowStore.js";
import { BroadcastSessionChannel } from "./BroadcastSessionChannel.js";
import { OidcClient } from "./OidcClient.js";

// WEB-US-7.5: a token never reaches any storage API, cookie or URL; the PKCE flow record is removed.
describe("tokens stay in memory", () => {
  it("no storage write contains a token, and nothing is left behind after sign-in and renewal", async () => {
    const writes: string[] = []; // every storage write goes through the fake below
    const idp = new FakeIdp({ issuer: "http://idp.test" });
    const fetcher = (async (i: RequestInfo | URL, init?: RequestInit) =>
      idp.handle(new Request(i, init))) as typeof fetch;
    const store = new Map<string, string>();
    const fake: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k) => store.get(k) ?? null,
      key: (i) => [...store.keys()][i] ?? null,
      removeItem: (k) => void store.delete(k),
      setItem: (k, v) => {
        writes.push(`${k}=${v}`);
        store.set(k, v);
      },
    };
    const oidc = new OidcClient({
      flows: new SessionFlowStore(() => fake),
      fetcher,
      allowInsecure: true,
    });
    const provider = {
      id: "idp",
      kind: "okta",
      name: "F",
      issuerUrl: "http://idp.test",
      consoleClientId: "console",
      isDefault: true,
    };
    const clock = { now: () => Date.now(), setTimeout: () => 0, clearTimeout: () => {} };
    const session = new Session({
      oidc,
      clock,
      channel: new BroadcastSessionChannel(`t-${Math.random()}`),
      redirectUri: "http://c.test/cb",
      providerById: () => provider,
    });

    const url = await oidc.begin(provider, { redirectUri: "http://c.test/cb", returnTo: "/" });
    const verifier = [...store.values()].map((v) => JSON.parse(v).verifier as string)[0] as string;
    const cb = (await fetcher(url, { redirect: "manual" })).headers.get("location") as string;
    expect((await new CompleteSignIn(oidc, session, clock).execute(cb)).kind).toBe("signed-in");
    const renewed = await session.accessToken({ forceRefresh: true });
    expect(renewed).toMatch(/^at\./);

    const all = writes.join("\n");
    expect(all).not.toMatch(/at\.svc-admin|rt-\d|eyJ/); // no access, refresh or ID token
    expect(all).toContain(verifier); // the verifier is stored until the callback only
    expect(store.size).toBe(0); // and removed afterwards
    expect(document.cookie).toBe("");
    expect(window.location.href).not.toMatch(/at\.|token/);
  });
});
