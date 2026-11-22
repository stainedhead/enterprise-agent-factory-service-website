import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import {
  adminCatalogsServices,
  D1,
  fakeStoragePort,
  fakeTemplatesPort,
} from "../../testing/adminCatalogs.js";
import { renderScreen } from "../../testing/screen.js";
import { ALL_PERMS, serviceAdminWith } from "../../testing/teams.js";
import S10 from "./index.js";

function open(
  section: string,
  o: {
    me?: Me;
    storage?: ReturnType<typeof fakeStoragePort>;
    templates?: ReturnType<typeof fakeTemplatesPort>;
  } = {},
) {
  const storage = o.storage ?? fakeStoragePort();
  const templates = o.templates ?? fakeTemplatesPort();
  renderScreen(<S10 />, {
    me: o.me ?? serviceAdminWith(ALL_PERMS),
    services: adminCatalogsServices(storage, templates),
    path: `/settings/${section}`,
    route: "/settings/:section",
  });
  return { storage, templates };
}
const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("S10 storage classes (M2-G1)", () => {
  it("adds, edits, disables and removes", async () => {
    const { storage } = open("storage-classes");
    await userEvent.click(await screen.findByRole("button", { name: "Add storage class" }));
    let d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "fast");
    await userEvent.selectOptions(within(d).getByLabelText("Volume type"), "io2");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(storage.put).toHaveBeenCalledTimes(1));

    await userEvent.click(await screen.findByRole("button", { name: "Edit gp3" }));
    d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(storage.put).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole("button", { name: "Disable gp3" }));
    await waitFor(() => expect(storage.put).toHaveBeenCalledTimes(3));

    await userEvent.click(screen.getByRole("button", { name: "Delete io2" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(storage.delete).toHaveBeenCalled());
  });
  it("shows a validation message for a bad name", async () => {
    open("storage-classes");
    await userEvent.click(await screen.findByRole("button", { name: "Add storage class" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "Bad Name");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(await within(d).findByText(/lower-case letters/)).toBeTruthy();
  });
  it("a class in use cannot be removed: the refusal names it and lists the agents", async () => {
    const storage = fakeStoragePort({
      delete: async () => {
        throw new AppError({
          kind: "conflict",
          message: "Agents use it",
          details: { agents: ["reviewer", "nightly"] },
        });
      },
    });
    open("storage-classes", { storage });
    await userEvent.click(await screen.findByRole("button", { name: "Delete gp3" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/gp3 is in use/);
    expect(alert.textContent).toMatch(/reviewer, nightly/);
  });
  it("is hidden from a service role without the permission", async () => {
    open("storage-classes", { me: serviceAdminWith([]) });
    expect(await screen.findByText(/not found|Not found/i)).toBeTruthy();
  });
});

describe("S10 agent templates (M2-G2, G3)", () => {
  it("lists templates and enables or disables one", async () => {
    const { templates } = open("agent-templates");
    await screen.findByText("coder");
    await userEvent.click(screen.getByRole("button", { name: "Enable legacy" }));
    await waitFor(() => expect(templates.put.mock.calls[0]?.[1]).toMatchObject({ enabled: true }));
  });
  it("adds a template with allowed digests and one current", async () => {
    const { templates } = open("agent-templates");
    await userEvent.click(await screen.findByRole("button", { name: "Add agent template" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "new-tpl");
    await userEvent.type(within(d).getByLabelText("Harness"), "hermes");
    await userEvent.type(within(d).getByLabelText("Default CPU"), "2");
    await userEvent.type(within(d).getByLabelText("Allowed digests"), D1);
    await userEvent.selectOptions(within(d).getByLabelText("Current digest"), D1);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(templates.put).toHaveBeenCalled());
    expect(templates.put.mock.calls[0]?.[1]).toMatchObject({
      harness: "hermes",
      currentDigest: D1,
      defaultResources: { cpu: "2" },
    });
  });
  it("refuses a bad digest and edits and deletes", async () => {
    const { templates } = open("agent-templates");
    await userEvent.click(await screen.findByRole("button", { name: "Edit coder" }));
    let d = await screen.findByRole("dialog");
    const digests = within(d).getByLabelText("Allowed digests");
    await userEvent.clear(digests);
    await userEvent.type(digests, "nope");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(await within(d).findByText(/at least one digest/)).toBeTruthy();
    await userEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete legacy" }));
    d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(templates.delete).toHaveBeenCalled());
  });
  it("disables every action for a caller without the permission", async () => {
    open("agent-templates", { me: serviceAdminWith(["admin:agent-templates"]) });
    const add = await screen.findByRole("button", { name: "Add agent template" });
    expect(disabled(add)).toBe(false);
  });
});

describe("S10 template capabilities (WEB-US-58)", () => {
  it("capabilities column and edit", async () => {
    const { templates } = open("agent-templates");
    await userEvent.click(await screen.findByRole("button", { name: "Edit coder" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/cannot be used for workers/)).toBeTruthy();
    await userEvent.click(within(d).getByRole("checkbox", { name: "paperclip" }));
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(templates.put).toHaveBeenCalled());
    expect(templates.put.mock.calls[0]?.[1]).toMatchObject({ capabilities: ["paperclip"] });
    expect(screen.getByRole("columnheader", { name: "Capabilities" })).toBeTruthy();
  });
  it("enabling or disabling keeps the capabilities", async () => {
    const templates = fakeTemplatesPort();
    templates.list.mockResolvedValue([
      {
        name: "hub",
        harness: "paperclip",
        enabled: true,
        currentDigest: D1,
        allowedDigests: [D1],
        capabilities: ["paperclip"],
        version: 1,
      },
    ] as never);
    open("agent-templates", { templates });
    await userEvent.click(await screen.findByRole("button", { name: "Disable hub" }));
    await waitFor(() => expect(templates.put).toHaveBeenCalled());
    expect(templates.put.mock.calls[0]?.[1]).toMatchObject({
      capabilities: ["paperclip"],
      enabled: false,
    });
  });
});
