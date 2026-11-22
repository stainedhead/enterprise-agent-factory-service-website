import { describe, expect, it } from "vitest";
import {
  aCollaboration,
  aLink,
  fakeCollaborationPort,
} from "../../../presentation/testing/collaboration.js";
import { AppError } from "../../errors.js";
import type { CollaborationPort } from "../../ports/collaboration.js";
import { AGENT_MISSING, CollaborationUseCases, isAgentMissing } from "./CollaborationUseCases.js";

const make = (over: Partial<CollaborationPort> = {}) => {
  const port = fakeCollaborationPort(over);
  return { port, uc: new CollaborationUseCases(port) };
};

describe("CollaborationUseCases", () => {
  it("put sends both switches with the version read", async () => {
    const { port, uc } = make();
    await uc.put("team_1", aCollaboration(), { webUiEnabled: false, restApiEnabled: true });
    expect(port.put).toHaveBeenCalledWith(
      "team_1",
      { version: 3 },
      { webUiEnabled: false, restApiEnabled: true },
    );
  });
  it("empty state on collaboration_agent_missing", () => {
    const e = new AppError({ kind: "not-found", message: "x", reason: AGENT_MISSING });
    expect(isAgentMissing(e)).toBe(true);
    expect(isAgentMissing(new AppError({ kind: "not-found", message: "x" }))).toBe(false);
    expect(isAgentMissing(new Error("x"))).toBe(false);
  });
  it("get and listLinks pass through", async () => {
    const { port, uc } = make();
    await uc.get("team_1");
    await uc.listLinks("team_1");
    expect(port.get).toHaveBeenCalled();
    expect(port.listLinks).toHaveBeenCalledWith("team_1", {}, undefined);
  });
  it("connect trims the Paperclip id and drops an empty one", async () => {
    const { port, uc } = make();
    await uc.connect("team_1", "agt_1", "  pc_1 ");
    await uc.connect("team_1", "agt_2", "  ");
    await uc.disconnect("team_1", "agt_1");
    expect(port.connect.mock.calls[0]?.[2]).toBe("pc_1");
    expect(port.connect.mock.calls[1]?.[2]).toBeUndefined();
    expect(port.disconnect).toHaveBeenCalled();
  });
  it("bulk sends one call per agent and one failure does not stop the rest", async () => {
    const calls: string[] = [];
    const { uc } = make({
      connect: async (_t: string, a: string) => {
        calls.push(a);
        if (a === "agt_2")
          throw new AppError({ kind: "conflict", message: "busy", requestId: "req_9" });
        if (a === "agt_3") throw new Error("boom");
        return aLink({ agentId: a });
      },
    });
    const r = await uc.bulk("team_1", "connect", [
      { id: "agt_1", name: "a" },
      { id: "agt_2", name: "b" },
      { id: "agt_3", name: "c" },
    ]);
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r[1]).toMatchObject({ message: "busy", requestId: "req_9" });
    expect(r[2]?.message).toBe("The request failed");
    expect(calls).toEqual(["agt_1", "agt_2", "agt_3"]);
  });
  it("bulk disconnect calls disconnect", async () => {
    const { port, uc } = make();
    await uc.bulk("team_1", "disconnect", [{ id: "agt_1", name: "a" }]);
    expect(port.disconnect).toHaveBeenCalledTimes(1);
  });
  it("rotateKeys passes the names", async () => {
    const { port, uc } = make();
    await uc.rotateKeys("team_1", ["paperclip-better-auth-secret"]);
    expect(port.rotateKeys).toHaveBeenCalledWith("team_1", ["paperclip-better-auth-secret"]);
  });
  it("keeps only the collaboration agent's afs and paperclip secrets", async () => {
    const s = await make().uc.managedSecrets("team_1", "agt_collab");
    expect(s.items.map((x) => x.id).sort()).toEqual(["sec_afs", "sec_paperclip"]);
    expect(s.more).toBe(false);
  });
  it("recent access aggregation", async () => {
    const r = await make().uc.recentAccess("team_1");
    expect(r).toMatchObject({ signIns: 5, people: 2, denied: 1 });
    expect(r.top[0]).toMatchObject({ id: "usr_1", requests: 15, serviceAdminEntry: true });
  });
  it("lists endpoints and the csv", async () => {
    const { port, uc } = make();
    await uc.listEndpoints({});
    expect(await uc.endpointsCsv({})).toContain("team");
    expect(port.listEndpoints).toHaveBeenCalled();
  });
});
