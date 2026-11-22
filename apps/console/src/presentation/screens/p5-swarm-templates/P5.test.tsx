import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import {
  adminCatalogsServices,
  fakeStoragePort,
  fakeTemplatesPort,
} from "../../testing/adminCatalogs.js";
import { aTemplate } from "../../testing/agents.js";
import { SEC_OP, SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSwarmTemplate,
  fakeSwarmTemplatesPort,
  fakeTeamDirectoryPort,
  fakeWorkOrdersPort,
  workOrdersServices,
} from "../../testing/workOrders.js";
import P5 from "./index.js";

function open(
  o: { me?: Me; port?: ReturnType<typeof fakeSwarmTemplatesPort>; catalog?: boolean } = {},
) {
  const port = o.port ?? fakeSwarmTemplatesPort();
  const catalog = fakeTemplatesPort();
  catalog.list.mockResolvedValue([
    aTemplate({ name: "paperclip-agent", id: "tpl_pc", capabilities: ["paperclip"] }),
    aTemplate({ name: "plain", id: "tpl_plain" }),
    aTemplate({ name: "off", id: "tpl_off", enabled: false, capabilities: ["paperclip"] }),
  ]);
  renderScreen(<P5 />, {
    me: o.me ?? SERVICE_ADMIN,
    services: {
      ...workOrdersServices(fakeWorkOrdersPort(), fakeTeamDirectoryPort(), port),
      ...adminCatalogsServices(fakeStoragePort(), catalog),
    },
    path: "/swarm-templates",
    route: "/swarm-templates",
  });
  return port;
}
const select = async (id: string) => {
  await userEvent.click(await screen.findByRole("radio", { name: `Select ${id}` }));
};
const action = async (label: string) => {
  await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
  await userEvent.click(await screen.findByRole("menuitem", { name: label }));
};

describe("P5 swarm templates (M6-T1)", () => {
  it("lists templates with state, cap, TTL and version, and shows the spec of the selected one", async () => {
    open();
    const table = await screen.findByRole("table", { name: "Swarm templates" });
    await waitFor(() => expect(within(table).getByText("Enabled")).toBeTruthy());
    expect(within(table).getByText("Disabled")).toBeTruthy();
    expect(within(table).getAllByText("72 h")).toHaveLength(2);
    await select("swt_1");
    const card = await screen.findByRole("region", { name: /cve-remediation · version 1/ });
    expect(within(card).getByText("scan")).toBeTruthy();
  });
  it("creates a template from the form and refuses an invalid one first", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Create template" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Create template" }));
    expect(
      await within(d).findByText(/lower-case letters, digits and hyphens, starting/),
    ).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
    await userEvent.type(within(d).getByLabelText("Name"), "cve-fix");
    await userEvent.type(within(d).getByLabelText("Spend cap (USD)"), "250");
    const spec = within(d).getByLabelText("Spec");
    await userEvent.clear(spec);
    await userEvent.click(spec);
    await userEvent.paste(
      '{"stages":[{"name":"a","position":1}],"pools":[{"name":"p","workers":2}]}',
    );
    expect(within(d).getByText(/afs swarm-templates create-swarm-template/).textContent).toContain(
      "--name cve-fix",
    );
    await userEvent.click(within(d).getByRole("button", { name: "Create template" }));
    await waitFor(() => expect(port.create).toHaveBeenCalledOnce());
    expect(port.create.mock.calls[0]?.[0]).toMatchObject({
      name: "cve-fix",
      budgetUsd: "250.00",
      enabled: false,
    });
    expect(await screen.findByText(/Template created/)).toBeTruthy();
  });
  it("offers paperclip agent templates as the collaboration agent and sends the choice", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Create template" }));
    const d = await screen.findByRole("dialog");
    const pick = within(d).getByLabelText("Collaboration agent") as HTMLSelectElement;
    await waitFor(() =>
      expect(within(pick).getByRole("option", { name: "paperclip-agent" })).toBeTruthy(),
    );
    expect(within(pick).queryByRole("option", { name: "plain" })).toBeNull();
    expect(within(pick).queryByRole("option", { name: "off" })).toBeNull();
    await userEvent.selectOptions(pick, "tpl_pc");
    await userEvent.type(within(d).getByLabelText("Name"), "cve-fix");
    await userEvent.type(within(d).getByLabelText("Spend cap (USD)"), "250");
    const spec = within(d).getByLabelText("Spec");
    await userEvent.clear(spec);
    await userEvent.click(spec);
    await userEvent.paste(
      '{"stages":[{"name":"a","position":1}],"pools":[{"name":"p","workers":2}]}',
    );
    await userEvent.click(within(d).getByRole("button", { name: "Create template" }));
    await waitFor(() => expect(port.create).toHaveBeenCalledOnce());
    expect(port.create.mock.calls[0]?.[0].spec.collaboration).toEqual({ templateId: "tpl_pc" });
  });
  it("edits only what changed, with the version", async () => {
    const port = open();
    await select("swt_1");
    await action("Edit");
    const d = await screen.findByRole("dialog");
    expect((within(d).getByLabelText("Name") as HTMLInputElement).readOnly).toBe(true);
    const ttl = within(d).getByLabelText(/Time to live/);
    await userEvent.clear(ttl);
    await userEvent.type(ttl, "96");
    await userEvent.click(within(d).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(port.update).toHaveBeenCalledOnce());
    expect(port.update.mock.calls[0]?.[0]).toEqual({ id: "swt_1", version: 1 });
    expect(port.update.mock.calls[0]?.[1]).toEqual({ ttlHours: 96 });
  });
  it("disables an enabled template and enables a disabled one, after confirming", async () => {
    const port = open();
    await select("swt_1");
    await action("Disable");
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Disable" }),
    );
    await waitFor(() => expect(port.disable).toHaveBeenCalledOnce());
    await select("swt_2");
    await action("Enable");
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Enable" }),
    );
    await waitFor(() => expect(port.enable).toHaveBeenCalledOnce());
  });
  it("deletes after confirming, and shows the API's refusal while a work order uses it", async () => {
    const del = vi.fn(async () => {
      throw new AppError({ kind: "conflict", message: "An open work order uses this template" });
    });
    open({ port: fakeSwarmTemplatesPort({ delete: del }) });
    await select("swt_1");
    await action("Delete");
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    expect(await screen.findByText("An open work order uses this template")).toBeTruthy();
    expect(del).toHaveBeenCalledOnce();
  });
  it("shows access denied from the API on a save", async () => {
    open({
      port: fakeSwarmTemplatesPort({
        update: async () => {
          throw new AppError({ kind: "access-denied", message: "Needs admin:swarm-templates" });
        },
      }),
    });
    await select("swt_1");
    await action("Edit");
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Description"), " more");
    await userEvent.click(within(d).getByRole("button", { name: "Save changes" }));
    expect(await within(d).findByText("You do not have access")).toBeTruthy();
  });
  it("needs a selection before an action", async () => {
    open();
    await screen.findByRole("table", { name: "Swarm templates" });
    await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    expect(
      (await screen.findByRole("menuitem", { name: "Edit" })).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("P5 for callers who cannot manage templates (M6-T2)", () => {
  it("a security operator reads the list with every change disabled and the role named", async () => {
    const port = open({ me: SEC_OP });
    await screen.findByRole("table", { name: "Swarm templates" });
    const create = screen.getByRole("button", { name: "Create template" });
    expect(create.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: /^Actions/ }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await userEvent.click(create);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(port.create).not.toHaveBeenCalled();
    await userEvent.hover(create);
    expect(await screen.findByText("Requires service admin")).toBeTruthy();
  });
  it("reports a refused list", async () => {
    open({
      me: TEAM_ADMIN,
      port: fakeSwarmTemplatesPort({
        list: async () => {
          throw new AppError({ kind: "access-denied", message: "Nope" });
        },
      }),
    });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
  it("has the template used in tests", () => expect(aSwarmTemplate().enabled).toBe(true));
});
