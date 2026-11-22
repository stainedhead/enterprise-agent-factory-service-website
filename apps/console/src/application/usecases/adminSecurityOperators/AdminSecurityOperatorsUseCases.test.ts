import { describe, expect, it } from "vitest";
import { anOperator, fakeOperatorsPort } from "../../../presentation/testing/adminApiKeys.js";
import { AdminSecurityOperatorsUseCases, operatorName } from "./AdminSecurityOperatorsUseCases.js";

const draft = { subjectType: "user" as const, email: "", groupName: "", identityProviderId: "" };

describe("AdminSecurityOperatorsUseCases (M6-K2)", () => {
  it("names a binding by email or group and lists sorted", async () => {
    const port = fakeOperatorsPort();
    const list = await new AdminSecurityOperatorsUseCases(port).list();
    expect(list.map(operatorName)).toEqual(["sam@example.com", "secops"]);
    expect(operatorName(anOperator({ email: undefined, userId: "usr_1" }))).toBe("usr_1");
    expect(operatorName(anOperator({ email: undefined }))).toBe("rb_1");
  });
  it("adds a person and a group", async () => {
    const port = fakeOperatorsPort();
    const uc = new AdminSecurityOperatorsUseCases(port);
    await uc.add({ ...draft, email: " a@b.co " });
    expect(port.add).toHaveBeenLastCalledWith({ subjectType: "user", email: "a@b.co" });
    await uc.add({
      ...draft,
      subjectType: "group",
      groupName: "secops",
      identityProviderId: "idp_1",
    });
    expect(port.add).toHaveBeenLastCalledWith({
      subjectType: "group",
      groupName: "secops",
      identityProviderId: "idp_1",
    });
    await uc.add({ ...draft, subjectType: "group", groupName: "secops" });
    expect(port.add).toHaveBeenLastCalledWith({ subjectType: "group", groupName: "secops" });
  });
  it.each([
    [{ ...draft }, "email"],
    [{ ...draft, email: "nope" }, "email"],
    [{ ...draft, subjectType: "group" as const }, "groupName"],
  ])("refuses %j without calling the API", async (d, field) => {
    const port = fakeOperatorsPort();
    await expect(new AdminSecurityOperatorsUseCases(port).add(d)).rejects.toMatchObject({
      fields: { [field]: expect.any(String) },
    });
    expect(port.add).not.toHaveBeenCalled();
  });
  it("removes by id", async () => {
    const port = fakeOperatorsPort();
    await new AdminSecurityOperatorsUseCases(port).remove(anOperator());
    expect(port.remove).toHaveBeenCalledWith("rb_1");
  });
});
