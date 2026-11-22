import { describe, expect, it, vi } from "vitest";
import { aLink, fakeIdentityPort } from "../../../presentation/testing/identity.js";
import {
  accountOfArn,
  IdentityUseCases,
  type LinkDraft,
  sessionLabel,
  trustPolicyText,
} from "./IdentityUseCases.js";

const clock = { setTimeout: (fn: () => void) => (fn(), 0) };
const dedicated = { id: "agt_1", iamIdentity: "dedicated" };
const draft: LinkDraft = {
  accountId: "111122223333",
  roleArn: "arn:aws:iam::111122223333:role/afs/reader",
  profileName: "prod-reader",
  maxSessionSeconds: 3600,
};
const allowed = ["111122223333"];

describe("accountOfArn and labels", () => {
  it("reads the account of a role ARN", () => {
    expect(accountOfArn("arn:aws:iam::111122223333:role/a/b")).toBe("111122223333");
    expect(accountOfArn("arn:aws:iam::1:role/a")).toBeUndefined();
    expect(accountOfArn("arn:aws:s3:::bucket")).toBeUndefined();
  });
  it("words the session length", () => {
    expect(sessionLabel(3600)).toBe("1 hour");
    expect(sessionLabel(1800)).toBe("30 minutes");
    expect(sessionLabel(undefined)).toBe("Default");
  });
  it("prints the trust policy only when the API gave one", () => {
    expect(trustPolicyText(aLink())).toContain("sts:ExternalId");
    expect(trustPolicyText(aLink({ trustPolicy: undefined }))).toBeUndefined();
  });
});

describe("addRoleLink (M4-I2)", () => {
  it("creates the link and returns it with its trust policy", async () => {
    const p = fakeIdentityPort();
    p.createRoleLink.mockResolvedValue(aLink({ trustPolicy: undefined }));
    const l = await new IdentityUseCases(p, clock).addRoleLink("t1", dedicated, draft, allowed);
    expect(p.createRoleLink).toHaveBeenCalledWith("t1", "agt_1", {
      roleArn: draft.roleArn,
      profileName: "prod-reader",
      maxSessionSeconds: 3600,
    });
    expect(p.roleLink).toHaveBeenCalled(); // the create response had no trust policy
    expect(l.trustPolicy).toBeDefined();
  });
  it.each([
    ["a shared agent", { ...dedicated, iamIdentity: "team_shared" }, draft, "roleArn"],
    [
      "an account outside the filter",
      dedicated,
      { ...draft, accountId: "999999999999" },
      "accountId",
    ],
    ["a malformed ARN", dedicated, { ...draft, roleArn: "role/x" }, "roleArn"],
    [
      "a role in another account",
      dedicated,
      { ...draft, roleArn: "arn:aws:iam::222233334444:role/x" },
      "roleArn",
    ],
    ["a bad profile name", dedicated, { ...draft, profileName: "a b" }, "profileName"],
    [
      "a session over 12 hours",
      dedicated,
      { ...draft, maxSessionSeconds: 50000 },
      "maxSessionSeconds",
    ],
  ])("refuses %s without a request", async (_n, agent, d, field) => {
    const p = fakeIdentityPort();
    await expect(
      new IdentityUseCases(p, clock).addRoleLink("t1", agent, d, allowed),
    ).rejects.toMatchObject({
      fields: { [field]: expect.any(String) },
    });
    expect(p.createRoleLink).not.toHaveBeenCalled();
  });
});

describe("verifyAll (M4-I3)", () => {
  it("sends one verification per link then reads until each reports a new result", async () => {
    const before = aLink({ status: "pending_trust", lastVerifiedAt: undefined, version: 1 });
    const after = aLink({ status: "verified", version: 2 });
    const reads = [[before], [after]];
    const p = fakeIdentityPort({ roleLinks: vi.fn(async () => reads.shift() ?? [after]) });
    const latest = await new IdentityUseCases(p, clock).verifyAll("t1", "agt_1", [before]);
    expect(p.verifyRoleLink).toHaveBeenCalledWith("t1", "agt_1", "lnk_1");
    expect(latest[0]?.status).toBe("verified");
    expect(p.roleLinks).toHaveBeenCalledTimes(2);
  });
  it("gives up after a bounded number of reads", async () => {
    const l = aLink({ status: "pending_trust", version: 1 });
    const p = fakeIdentityPort({ roleLinks: vi.fn(async () => [l]) });
    await new IdentityUseCases(p, clock).verifyAll("t1", "agt_1", [l]);
    expect(p.roleLinks).toHaveBeenCalledTimes(10);
  });
});

describe("identities (M4-I5)", () => {
  it("adds with the secret reference and refuses an empty identifier", async () => {
    const p = fakeIdentityPort();
    const u = new IdentityUseCases(p, clock);
    await expect(
      u.addIdentity("t", "a", { kind: "external", externalRef: " " }),
    ).rejects.toMatchObject({
      fields: { externalRef: expect.any(String) },
    });
    await u.addIdentity("t", "a", {
      kind: "github_app",
      externalRef: " app-1 ",
      secretId: "sec_1",
    });
    expect(p.createIdentity).toHaveBeenCalledWith("t", "a", {
      kind: "github_app",
      externalRef: "app-1",
      secretId: "sec_1",
    });
  });
  it("removes with the version it read", async () => {
    const p = fakeIdentityPort();
    await new IdentityUseCases(p, clock).removeIdentity("t", "a", { id: "aid_1", version: 3 });
    expect(p.deleteIdentity).toHaveBeenCalledWith("t", "a", { id: "aid_1", version: 3 });
    await new IdentityUseCases(p, clock).removeRoleLink("t", "a", aLink({ version: 7 }));
    expect(p.deleteRoleLink).toHaveBeenCalledWith("t", "a", { id: "lnk_1", version: 7 });
  });
});
