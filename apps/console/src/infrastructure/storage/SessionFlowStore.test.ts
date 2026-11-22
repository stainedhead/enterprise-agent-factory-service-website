import { describe, expect, it } from "vitest";
import { AuthError } from "../../application/ports/auth.js";
import {
  FLOW_MAX_AGE_MS,
  FLOW_MAX_ENTRIES,
  type PendingFlow,
  SessionDraftStorage,
  SessionFlowStore,
} from "./SessionFlowStore.js";

const provider = {
  id: "idp",
  kind: "okta",
  name: "Fake",
  issuerUrl: "http://idp.test",
  consoleClientId: "console",
  isDefault: true,
};
const flow = (createdAt: number): PendingFlow => ({
  verifier: "v",
  nonce: "n",
  redirectUri: "http://console.test/auth/callback",
  returnTo: "/",
  provider,
  createdAt,
});

class MemoryStorage implements Storage {
  #m = new Map<string, string>();
  get length() {
    return this.#m.size;
  }
  clear() {
    this.#m.clear();
  }
  getItem(k: string) {
    return this.#m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.#m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.#m.delete(k);
  }
  setItem(k: string, v: string) {
    this.#m.set(k, v);
  }
}

describe("SessionFlowStore", () => {
  const T0 = 1_000_000;
  const keys = (m: MemoryStorage) =>
    Array.from({ length: m.length }, (_, i) => m.key(i) as string).filter((k) =>
      k.startsWith("afs.flow."),
    );
  it("is single use and tolerates corrupt or unavailable storage", () => {
    const shared = new MemoryStorage();
    const s = new SessionFlowStore(() => shared);
    s.put("a", flow(T0));
    expect(s.take("a")).toEqual(flow(T0));
    expect(s.take("a")).toBeUndefined();
    const m = new MemoryStorage();
    m.setItem("afs.flow.b", "{not json");
    expect(new SessionFlowStore(() => m).take("b")).toBeUndefined();
    expect(
      new SessionFlowStore(() => {
        throw new Error("blocked");
      }).take("c"),
    ).toBeUndefined();
  });

  it("put drops flows older than 10 minutes (FR-012)", () => {
    const m = new MemoryStorage();
    const s = new SessionFlowStore(() => m);
    s.put("old", flow(T0));
    s.put("fresh", flow(T0 + FLOW_MAX_AGE_MS - 1));
    s.put("new", flow(T0 + FLOW_MAX_AGE_MS + 1)); // "old" is now 10 minutes and 1 ms old
    expect(keys(m).sort()).toEqual(["afs.flow.fresh", "afs.flow.new"]);
    expect(FLOW_MAX_AGE_MS).toBe(10 * 60_000);
  });

  it("put caps the entries at 5, dropping the oldest", () => {
    const m = new MemoryStorage();
    const s = new SessionFlowStore(() => m);
    for (let i = 0; i < 8; i++) s.put(`s${i}`, flow(T0 + i));
    expect(FLOW_MAX_ENTRIES).toBe(5);
    expect(keys(m).sort()).toEqual(["s3", "s4", "s5", "s6", "s7"].map((k) => `afs.flow.${k}`));
    expect(s.take("s2")).toBeUndefined();
    expect(s.take("s7")).toBeDefined();
  });

  it("put drops entries it cannot read, and leaves other keys alone", () => {
    const m = new MemoryStorage();
    m.setItem("afs.flow.junk", "{not json");
    m.setItem("afs.flow.legacy", JSON.stringify({ ...flow(0), createdAt: undefined }));
    m.setItem("unrelated", "keep");
    new SessionFlowStore(() => m).put("a", flow(T0));
    expect(keys(m)).toEqual(["afs.flow.a"]);
    expect(m.getItem("unrelated")).toBe("keep");
  });

  it("discard removes one flow and is harmless when it is gone or storage is blocked", () => {
    const m = new MemoryStorage();
    const s = new SessionFlowStore(() => m);
    s.put("a", flow(T0));
    s.discard("a");
    s.discard("a");
    expect(keys(m)).toEqual([]);
    expect(() =>
      new SessionFlowStore(() => {
        throw new Error("blocked");
      }).discard("a"),
    ).not.toThrow();
  });

  it("blocked storage makes put throw an AuthError that says browser storage is required", () => {
    const blocked = new SessionFlowStore(() => {
      throw new Error("SecurityError");
    });
    const err = (() => {
      try {
        blocked.put("a", flow(T0));
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).reason).toBe("storage");
    expect((err as AuthError).message).toMatch(/browser storage is required for sign-in/i);
    // a full store is the same failure
    const full = new MemoryStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => new SessionFlowStore(() => full).put("a", flow(T0))).toThrow(AuthError);
  });
});

describe("SessionDraftStorage", () => {
  it("clear removes the afs.drafts key and nothing else (FR-004 AC3)", () => {
    const m = new MemoryStorage();
    const d = new SessionDraftStorage(() => m);
    d.write({ f: { a: "1" } });
    m.setItem("other", "x");
    expect(m.getItem("afs.drafts")).not.toBeNull();
    d.clear();
    expect(m.getItem("afs.drafts")).toBeNull();
    expect(m.getItem("other")).toBe("x");
    expect(d.take()).toEqual({});
  });
  it("clear tolerates blocked storage", () => {
    expect(() =>
      new SessionDraftStorage(() => {
        throw new Error("blocked");
      }).clear(),
    ).not.toThrow();
  });
});
