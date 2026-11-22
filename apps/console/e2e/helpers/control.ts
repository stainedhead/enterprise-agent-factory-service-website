import type { Injection, RecordedRequest } from "../fake-afs/server.js";

const API = `http://127.0.0.1:${process.env.FAKE_AFS_PORT ?? 4400}`;
const IDP = `http://127.0.0.1:${process.env.FAKE_IDP_PORT ?? 4401}`;

export const ENDPOINTS = { api: API, idp: IDP };

const post = async (url: string, body?: unknown) => {
  const r = await fetch(url, {
    method: "POST",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
};

/** Test-side control of the fake AFS API and the fake IdP (a separate channel from the console). */
export const control = {
  async reset(): Promise<void> {
    await post(`${API}/__reset`);
  },
  async recorded(): Promise<RecordedRequest[]> {
    return (await (await fetch(`${API}/__recorded`)).json()) as RecordedRequest[];
  },
  async inject(i: Injection): Promise<void> {
    await post(`${API}/__inject`, i);
  },
  async contractVersion(v: string): Promise<void> {
    await post(`${API}/__contract-version?v=${encodeURIComponent(v)}`);
  },
  /** `user` picks who the IdP signs in next; `ttl` is the access-token lifetime in seconds; `refresh` toggles refresh tokens. */
  async idp(opts: {
    user?: string;
    ttl?: number;
    refresh?: boolean;
    revoke?: boolean;
  }): Promise<number> {
    const q = new URLSearchParams();
    if (opts.user) q.set("user", opts.user);
    if (opts.ttl !== undefined) q.set("ttl", String(opts.ttl));
    if (opts.refresh !== undefined) q.set("refresh", opts.refresh ? "on" : "off");
    if (opts.revoke) q.set("revoke", "1");
    return ((await (await post(`${IDP}/__idp?${q}`)).json()) as { requests: number }).requests;
  },
};
