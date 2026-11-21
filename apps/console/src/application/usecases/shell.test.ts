import { describe, expect, it, vi } from "vitest";
import type { Me } from "../../domain/me.js";
import { AppError, isAppError } from "../errors.js";
import { BuildSearchIndex, teamsSource } from "./BuildSearchIndex.js";
import { ContractNotice } from "./ContractNotice.js";
import { GetMe, ME_STALE_MS } from "./GetMe.js";

const me: Me = {
  principal: { id: "u", type: "user" },
  serviceAdmin: false,
  securityOperator: false,
  teams: [],
};

function setup() {
  let t = 0;
  const get = vi.fn(async () => me);
  const uc = new GetMe({ get }, { now: () => t });
  return {
    uc,
    get,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("GetMe", () => {
  it("fetches once, serves the held value while fresh, and shares concurrent requests", async () => {
    const { uc, get } = setup();
    const seen: unknown[] = [];
    uc.onChange((m) => seen.push(m));
    await Promise.all([uc.execute(), uc.execute()]);
    await uc.execute();
    expect(get).toHaveBeenCalledOnce();
    expect(uc.current).toBe(me);
    expect(seen).toEqual([me]);
  });
  it("refetches when forced, and on focus only when older than five minutes", async () => {
    const { uc, get, advance } = setup();
    await uc.onFocus(); // nothing held yet
    expect(get).not.toHaveBeenCalled();
    await uc.execute();
    advance(ME_STALE_MS - 1);
    await uc.onFocus();
    expect(get).toHaveBeenCalledTimes(1);
    advance(2);
    await uc.onFocus();
    expect(get).toHaveBeenCalledTimes(2);
    await uc.execute({ force: true });
    expect(get).toHaveBeenCalledTimes(3);
  });
  it("refreshes after AccessDenied and keeps the held value if that fails", async () => {
    const { uc, get } = setup();
    await uc.execute();
    get.mockRejectedValueOnce(new AppError({ kind: "unavailable", message: "x" }));
    await uc.onAccessDenied();
    expect(uc.current).toBe(me);
    await uc.onAccessDenied();
    expect(get).toHaveBeenCalledTimes(3);
  });
  it("a boot failure rejects with the AppError and clear drops the value", async () => {
    const err = new AppError({ kind: "unavailable", message: "down" });
    const uc = new GetMe(
      {
        get: async () => {
          throw err;
        },
      },
      { now: () => 0 },
    );
    await expect(uc.execute()).rejects.toBe(err);
    await expect(uc.execute()).rejects.toBe(err); // not cached as success
    const ok = setup();
    await ok.uc.execute();
    const seen: unknown[] = [];
    ok.uc.onChange((m) => seen.push(m));
    ok.uc.clear();
    expect(ok.uc.current).toBeUndefined();
    expect(seen).toEqual([undefined]);
  });
});

describe("ContractNotice", () => {
  it("shows once on mismatch and stays dismissed", () => {
    const n = new ContractNotice();
    const fn = vi.fn();
    n.onChange(fn);
    expect(n.visible).toBe(false);
    n.report();
    n.report();
    expect(n.visible).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    n.dismiss();
    n.report();
    expect(n.visible).toBe(false);
  });
});

describe("BuildSearchIndex", () => {
  it("builds team entries from the list call and skips a failing source", async () => {
    const port = { listTeams: vi.fn(async () => [{ teamId: "team_1", label: "Alpha" }]) };
    const bad = {
      type: "agent" as const,
      load: async () => {
        throw new Error("x");
      },
    };
    const idx = await new BuildSearchIndex(port, [teamsSource, bad]).execute();
    expect(idx).toEqual([{ type: "team", id: "team_1", label: "Alpha", route: "/t/team_1" }]);
    expect(port.listTeams).toHaveBeenCalledOnce();
  });
});

describe("AppError", () => {
  it("defaults and type guard", () => {
    const e = new AppError({ kind: "access-denied", message: "m" });
    expect(e.fields).toEqual({});
    expect(e.isAccessDenied).toBe(true);
    expect(isAppError(e)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });
});
