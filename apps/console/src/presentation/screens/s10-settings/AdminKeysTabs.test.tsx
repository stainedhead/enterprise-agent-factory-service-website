import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import {
  adminApiKeysServices,
  fakeAdminApiKeysPort,
  fakeOperatorsPort,
} from "../../testing/adminApiKeys.js";
import { renderScreen } from "../../testing/screen.js";
import { ALL_PERMS, serviceAdminWith } from "../../testing/teams.js";
import S10 from "./index.js";

function open(
  section: string,
  o: {
    me?: Me;
    keys?: ReturnType<typeof fakeAdminApiKeysPort>;
    ops?: ReturnType<typeof fakeOperatorsPort>;
  } = {},
) {
  const keys = o.keys ?? fakeAdminApiKeysPort();
  const ops = o.ops ?? fakeOperatorsPort();
  renderScreen(<S10 />, {
    me: o.me ?? serviceAdminWith(ALL_PERMS),
    services: adminApiKeysServices(keys, ops),
    path: `/settings/${section}`,
    route: "/settings/:section",
  });
  return { keys, ops };
}
const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("S10 service API keys (M6-K1)", () => {
  it("creates a key, shows the secret once and does not keep it", async () => {
    const { keys } = open("service-api-keys");
    await screen.findByText("pipeline");
    await userEvent.click(screen.getByRole("button", { name: "Create service API key" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "new");
    expect(within(d).getByLabelText("Role")).toHaveProperty("readOnly", true);
    expect(d.textContent).toMatch(/afs admin create-api-key .*--role security_operator/);
    await userEvent.click(within(d).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(keys.create).toHaveBeenCalled());
    expect(keys.create.mock.calls[0]?.[0]).toMatchObject({ role: "security_operator" });
    const secret = await screen.findByText("afsk_SENTINEL");
    expect(secret).toBeTruthy();
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /close|done/i }),
    );
    await waitFor(() => expect(screen.queryByText("afsk_SENTINEL")).toBeNull());
  });
  it("says a replayed create cannot show the secret again", async () => {
    const keys = fakeAdminApiKeysPort({
      create: async () => ({
        key: {
          id: "key_5",
          name: "dup",
          role: "security_operator",
          keyPrefix: "afsk_5",
          expiresAt: "2026-12-01T00:00:00Z",
          createdAt: "2026-11-22T00:00:00Z",
          lastUsedAt: null,
        },
        secretKey: undefined,
        replayed: true,
      }),
    });
    open("service-api-keys", { keys });
    await userEvent.click(await screen.findByRole("button", { name: "Create service API key" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "dup");
    await userEvent.click(within(d).getByRole("button", { name: "Create key" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/cannot be shown again/);
  });
  it("shows a validation message for a bad number of days", async () => {
    const { keys } = open("service-api-keys");
    await userEvent.click(await screen.findByRole("button", { name: "Create service API key" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "x");
    const days = within(d).getByLabelText("Expires in (days)");
    await userEvent.clear(days);
    await userEvent.type(days, "120");
    await userEvent.click(within(d).getByRole("button", { name: "Create key" }));
    expect(await within(d).findByText(/from 1 to 90/)).toBeTruthy();
    expect(keys.create).not.toHaveBeenCalled();
  });
  it("deletes after a confirmation", async () => {
    const { keys } = open("service-api-keys");
    await userEvent.click(await screen.findByRole("button", { name: "Delete key pipeline" }));
    const d = await screen.findByRole("dialog");
    expect(d.textContent).toMatch(/afs admin delete-api-key --key-id key_9/);
    await userEvent.click(within(d).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(keys.delete).toHaveBeenCalledWith("key_9"));
  });
  it("shows the API's refusal when the delete is denied", async () => {
    const keys = fakeAdminApiKeysPort({
      delete: async () => {
        throw new AppError({ kind: "access-denied", message: "Needs service admin" });
      },
    });
    open("service-api-keys", { keys });
    await userEvent.click(await screen.findByRole("button", { name: "Delete key pipeline" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/You do not have access/);
  });
  it("disables create and delete without admin:settings, and hides the tab without it", async () => {
    open("service-api-keys", { me: serviceAdminWith(["admin:settings"]) });
    expect(disabled(await screen.findByRole("button", { name: "Create service API key" }))).toBe(
      false,
    );
  });
  it("is not found for a service role without the permission", async () => {
    open("service-api-keys", { me: serviceAdminWith([]) });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});

describe("S10 security operators (M6-K2)", () => {
  it("lists people and groups, adds a person and removes one", async () => {
    const { ops } = open("security-operators");
    await screen.findByText("sam@example.com");
    expect(screen.getByText("secops")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add security operator" }));
    let d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Email"), "new@example.com");
    expect(d.textContent).toMatch(/afs admin add-security-operator/);
    await userEvent.click(within(d).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(ops.add).toHaveBeenCalledWith({ subjectType: "user", email: "new@example.com" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Remove sam@example.com" }));
    d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(ops.remove).toHaveBeenCalledWith("rb_1"));
  });
  it("adds a group and refuses a bad email", async () => {
    const { ops } = open("security-operators");
    await userEvent.click(await screen.findByRole("button", { name: "Add security operator" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Email"), "nope");
    await userEvent.click(within(d).getByRole("button", { name: "Add" }));
    expect(await within(d).findByText(/Enter an email such as/)).toBeTruthy();
    await userEvent.selectOptions(within(d).getByLabelText("Type"), "group");
    await userEvent.type(within(d).getByLabelText("Group name"), "secops-2");
    await userEvent.click(within(d).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(ops.add).toHaveBeenCalledWith({ subjectType: "group", groupName: "secops-2" }),
    );
  });
  it("shows the API's refusal when the add is denied", async () => {
    const ops = fakeOperatorsPort({
      add: async () => {
        throw new AppError({ kind: "access-denied", message: "Needs service admin" });
      },
    });
    open("security-operators", { ops });
    await userEvent.click(await screen.findByRole("button", { name: "Add security operator" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Email"), "a@b.co");
    await userEvent.click(within(d).getByRole("button", { name: "Add" }));
    expect((await within(d).findByRole("alert")).textContent).toMatch(/You do not have access/);
  });
  it("is not found without admin:settings", async () => {
    open("security-operators", { me: serviceAdminWith([]) });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});
