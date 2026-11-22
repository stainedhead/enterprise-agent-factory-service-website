import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { fakeIdpPort, fakeSettingsPort, settingsServices } from "../../testing/settings.js";
import { ALL_PERMS, serviceAdminWith } from "../../testing/teams.js";
import S10 from "./index.js";

function open(
  o: {
    path?: string;
    me?: Me;
    settings?: ReturnType<typeof fakeSettingsPort>;
    idps?: ReturnType<typeof fakeIdpPort>;
  } = {},
) {
  const settings = o.settings ?? fakeSettingsPort();
  const idps = o.idps ?? fakeIdpPort();
  renderScreen(<S10 />, {
    me: o.me ?? serviceAdminWith(ALL_PERMS),
    services: settingsServices(settings, idps),
    path: o.path ?? "/settings/general",
    route: "/settings/:section",
  });
  return { settings, idps };
}

describe("S10 shell (M1-N1)", () => {
  it("shows the Settings and Identity providers tabs", async () => {
    open();
    expect(await screen.findByRole("tab", { name: "Settings", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Identity providers" })).toBeTruthy();
  });

  it("an unknown section is not found", async () => {
    open({ path: "/settings/nope" });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });

  it("denied: a team admin gets not-found and nothing is requested", async () => {
    const { settings } = open({ me: TEAM_ADMIN });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(settings.list).not.toHaveBeenCalled();
  });

  it("a section the caller lacks the permission for is not found", async () => {
    open({ me: serviceAdminWith(["admin:settings"]), path: "/settings/identity-providers" });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});

describe("S10 Settings (M1-N2)", () => {
  it("lists key, value, default, allowed range and last change", async () => {
    open();
    const row = (await screen.findByText("audit.retention_days")).closest("tr") as HTMLElement;
    expect(within(row).getByText("30 to 3650")).toBeTruthy();
    expect(row.querySelector("time")).toBeTruthy();
    const other = screen.getByText("gateway.enabled").closest("tr") as HTMLElement;
    expect(within(other).getByText("Never")).toBeTruthy();
  });

  it("edits a value against the held version", async () => {
    const { settings } = open();
    await screen.findByText("audit.retention_days");
    await userEvent.click(screen.getByRole("button", { name: "Edit audit.retention_days" }));
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByLabelText("Value");
    await userEvent.clear(field);
    await userEvent.type(field, "90");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(settings.put).toHaveBeenCalledWith({ key: "audit.retention_days", version: 4 }, 90),
    );
  });

  it("validates the range before sending", async () => {
    const { settings } = open();
    await screen.findByText("audit.retention_days");
    await userEvent.click(screen.getByRole("button", { name: "Edit audit.retention_days" }));
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByLabelText("Value");
    await userEvent.clear(field);
    await userEvent.type(field, "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      (await within(dialog).findAllByText(/Enter 30 or more, up to 3650/)).length,
    ).toBeGreaterThan(0);
    expect(settings.put).not.toHaveBeenCalled();
  });

  it("offers true or false for a boolean", async () => {
    const { settings } = open();
    await screen.findByText("gateway.enabled");
    await userEvent.click(screen.getByRole("button", { name: "Edit gateway.enabled" }));
    await userEvent.selectOptions(
      within(screen.getByRole("dialog")).getByLabelText("Value"),
      "false",
    );
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(settings.put).toHaveBeenCalledWith({ key: "gateway.enabled", version: 4 }, false),
    );
  });

  it("a 412 offers a reload", async () => {
    const settings = fakeSettingsPort({
      put: vi.fn(async () => {
        throw new AppError({ kind: "stale", message: "changed", requestId: "req_3" });
      }),
    });
    open({ settings });
    await screen.findByText("audit.retention_days");
    await userEvent.click(screen.getByRole("button", { name: "Edit audit.retention_days" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: /Reload/ })).toBeTruthy();
  });

  it("denied: without admin:settings the Settings section is not found and nothing is read", async () => {
    const { settings } = open({ me: serviceAdminWith(["admin:identity-providers"]) });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(settings.list).not.toHaveBeenCalled();
  });
});

describe("S10 Identity providers (M1-N3)", () => {
  const tab = { path: "/settings/identity-providers" };
  const select = async (name: string) => {
    const row = (await screen.findByText(name)).closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("radio"));
  };
  const menu = async (item: string) => {
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: item }));
  };

  it("lists providers with default, state and only the secret's ARN", async () => {
    open(tab);
    const row = (await screen.findByText("Corporate SSO")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Enabled")).toBeTruthy();
    expect(within(row).getByText("Default")).toBeTruthy();
    expect(within(row).getByText(/arn:aws:secretsmanager/)).toBeTruthy();
    const other = screen.getByText("Contractors").closest("tr") as HTMLElement;
    expect(within(other).getByText("None")).toBeTruthy();
  });

  it("adds a provider, shows the CLI command and takes an ARN, never a secret value", async () => {
    const { idps } = open(tab);
    await screen.findByText("Corporate SSO");
    await userEvent.click(screen.getByRole("button", { name: "Add provider" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Entra");
    await userEvent.selectOptions(within(dialog).getByLabelText("Type"), "entra_id");
    await userEvent.type(
      within(dialog).getByLabelText("Issuer URL"),
      "https://login.microsoftonline.com/x/v2.0",
    );
    await userEvent.type(within(dialog).getByLabelText("Console client id"), "c1");
    await userEvent.type(within(dialog).getByLabelText("CLI client id"), "c2");
    expect(within(dialog).getByText(/afs admin create-identity-provider/)).toBeTruthy();
    expect(document.querySelector("input[type=password]")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(idps.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "entra_id",
          name: "Entra",
          consoleClientId: "c1",
          cliClientId: "c2",
        }),
      ),
    );
  });

  it("shows field errors for a non-https issuer without calling the API", async () => {
    const { idps } = open(tab);
    await screen.findByText("Corporate SSO");
    await userEvent.click(screen.getByRole("button", { name: "Add provider" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "X");
    await userEvent.type(within(dialog).getByLabelText("Issuer URL"), "http://x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText("Enter an https:// issuer URL")).toBeTruthy();
    expect(idps.create).not.toHaveBeenCalled();
  });

  it("selecting a provider lists the teams using it", async () => {
    open(tab);
    await select("Corporate SSO");
    const link = (await screen.findByRole("link", { name: "Alpha" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/teams/team_1/admin");
  });

  it("Disable is disabled while a team uses the provider, with the count", async () => {
    open(tab);
    await select("Corporate SSO");
    await screen.findByRole("link", { name: "Alpha" });
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    const item = screen.getByRole("menuitem", { name: "Disable" });
    expect(
      item.getAttribute("aria-disabled") === "true" || (item as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("disables an unused provider after confirming", async () => {
    const { idps } = open(tab);
    await select("Contractors");
    await screen.findByText("No team uses this provider.");
    await menu("Disable");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Disable" }),
    );
    await waitFor(() =>
      expect(idps.update).toHaveBeenCalledWith({ id: "idp_2", version: 2 }, { enabled: false }),
    );
  });

  it("shows the API's 409 when a disable races with a team starting to use the provider", async () => {
    const idps = fakeIdpPort({
      update: vi.fn(async () => {
        throw new AppError({
          kind: "conflict",
          message: "Identity provider is in use by 1 team",
          requestId: "req_9",
        });
      }),
    });
    open({ ...tab, idps });
    await select("Contractors");
    await screen.findByText("No team uses this provider.");
    await menu("Disable");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Disable" }),
    );
    expect(await screen.findByText(/in use by 1 team/)).toBeTruthy();
    expect(screen.getByText(/req_9/)).toBeTruthy();
  });

  it("makes a provider the default", async () => {
    const { idps } = open(tab);
    await select("Contractors");
    await screen.findByText("No team uses this provider.");
    await menu("Make default");
    await waitFor(() =>
      expect(idps.update).toHaveBeenCalledWith({ id: "idp_2", version: 2 }, { isDefault: true }),
    );
  });

  it("edits a provider with the held version and clears the ARN when blank", async () => {
    const { idps } = open(tab);
    await select("Corporate SSO");
    await menu("Edit");
    const dialog = screen.getByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Client secret ARN"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(idps.update).toHaveBeenCalledWith(
        { id: "idp_1", version: 2 },
        expect.objectContaining({ clientSecretArn: null }),
      ),
    );
  });

  it("denied: without admin:identity-providers the tab is hidden", async () => {
    open({ me: serviceAdminWith(["admin:settings"]) });
    await screen.findByText("audit.retention_days");
    expect(screen.queryByRole("tab", { name: "Identity providers" })).toBeNull();
  });
});

describe("S10 identity provider collaboration client (WEB-US-58)", () => {
  const tab = { path: "/settings/identity-providers" };
  const fill = async (dialog: HTMLElement) => {
    await userEvent.type(within(dialog).getByLabelText("Name"), "Entra");
    await userEvent.type(
      within(dialog).getByLabelText("Issuer URL"),
      "https://login.microsoftonline.com/x/v2.0",
    );
    await userEvent.type(within(dialog).getByLabelText("Console client id"), "c1");
    await userEvent.type(within(dialog).getByLabelText("CLI client id"), "c2");
  };
  it("collaboration client fields, sent with the create", async () => {
    const { idps } = open(tab);
    await userEvent.click(await screen.findByRole("button", { name: "Add provider" }));
    const dialog = screen.getByRole("dialog");
    await fill(dialog);
    await userEvent.type(within(dialog).getByLabelText("Collaboration client id"), "collab-1");
    await userEvent.type(
      within(dialog).getByLabelText("Collaboration client secret ARN"),
      "arn:aws:secretsmanager:eu-west-1:000000000000:secret:collab",
    );
    expect(within(dialog).getByText(/--collab-client-id collab-1/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(idps.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collabClientId: "collab-1",
          collabClientSecretArn: "arn:aws:secretsmanager:eu-west-1:000000000000:secret:collab",
        }),
      ),
    );
  });
  it("reference needs client id", async () => {
    const { idps } = open(tab);
    await userEvent.click(await screen.findByRole("button", { name: "Add provider" }));
    const dialog = screen.getByRole("dialog");
    await fill(dialog);
    await userEvent.type(
      within(dialog).getByLabelText("Collaboration client secret ARN"),
      "arn:aws:secretsmanager:eu-west-1:000000000000:secret:collab",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText(/Enter the collaboration client id/)).toBeTruthy();
    expect(idps.create).not.toHaveBeenCalled();
  });
  it("refuses a reference that is not an ARN", async () => {
    const { idps } = open(tab);
    await userEvent.click(await screen.findByRole("button", { name: "Add provider" }));
    const dialog = screen.getByRole("dialog");
    await fill(dialog);
    await userEvent.type(within(dialog).getByLabelText("Collaboration client id"), "collab-1");
    await userEvent.type(
      within(dialog).getByLabelText("Collaboration client secret ARN"),
      "hunter2",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(
      (await within(dialog).findAllByText(/Enter a Secrets Manager ARN/)).length,
    ).toBeGreaterThan(0);
    expect(idps.create).not.toHaveBeenCalled();
  });
  it("the list has a Collaboration column", async () => {
    open(tab);
    await screen.findByText("Corporate SSO");
    expect(screen.getByRole("columnheader", { name: "Collaboration" })).toBeTruthy();
    expect(screen.getAllByText("Not configured").length).toBeGreaterThan(0);
  });
});
