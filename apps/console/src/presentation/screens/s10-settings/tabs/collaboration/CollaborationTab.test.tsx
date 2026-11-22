import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../../application/errors.js";
import { collaborationServices, fakeCollaborationPort } from "../../../../testing/collaboration.js";
import { TEAM_ADMIN } from "../../../../testing/harness.js";
import { renderScreen } from "../../../../testing/screen.js";
import {
  aSetting,
  fakeIdpPort,
  fakeSettingsPort,
  settingsServices,
} from "../../../../testing/settings.js";
import { ALL_PERMS, serviceAdminWith } from "../../../../testing/teams.js";
import S10 from "../../index.js";

const collab = (over = {}) => [
  aSetting({
    key: "collab.base_domain",
    value: null,
    default: null,
    type: "string",
    allowed: "a DNS domain",
    nullable: true,
    min: undefined,
    max: undefined,
  }),
  aSetting({
    key: "collab.public_endpoints",
    type: "boolean",
    value: true,
    default: true,
    allowed: "true or false",
    min: undefined,
    max: undefined,
  }),
  aSetting({
    key: "collab.allowed_source_cidrs",
    type: "array",
    value: [],
    default: [],
    allowed: "CIDRs",
    min: undefined,
    max: undefined,
  }),
  aSetting({
    key: "collab.session_ttl_minutes",
    value: 480,
    default: 480,
    allowed: "15 to 1440",
    min: 15,
    max: 1440,
  }),
  aSetting({
    key: "collab.content_scan",
    type: "string",
    value: "block",
    default: "block",
    allowed: "block, warn, off",
    min: undefined,
    max: undefined,
  }),
  aSetting({
    key: "collab.max_body_mb",
    value: 10,
    default: 10,
    allowed: "1 to 100",
    min: 1,
    max: 100,
  }),
  aSetting({
    key: "collab.denied_spike_threshold",
    value: 50,
    default: 50,
    allowed: "1 to 100000",
    min: 1,
    max: 100000,
  }),
  aSetting(),
  ...Object.values(over),
];

function open(
  o: {
    settings?: ReturnType<typeof fakeSettingsPort>;
    port?: ReturnType<typeof fakeCollaborationPort>;
    path?: string;
    me?: Parameters<typeof renderScreen>[1]["me"];
  } = {},
) {
  const settings = o.settings ?? fakeSettingsPort({ list: vi.fn(async () => collab()) as never });
  const port = o.port ?? fakeCollaborationPort();
  renderScreen(<S10 />, {
    me: o.me ?? serviceAdminWith(ALL_PERMS),
    services: { ...settingsServices(settings, fakeIdpPort()), ...collaborationServices(port) },
    path: o.path ?? "/settings/collaboration",
    route: "/settings/:section",
  });
  return { settings, port };
}

describe("S10 Collaboration tab (WEB-US-57)", () => {
  it("seven settings and ranges", async () => {
    open();
    const t = await screen.findByRole("table", { name: "Collaboration settings" });
    expect(await within(t).findByText("collab.base_domain")).toBeTruthy();
    expect(within(t).getAllByRole("row")).toHaveLength(8);
    expect(within(t).getByText("15 to 1440")).toBeTruthy();
    expect(within(t).getByText(/Not set. Public collaboration is off/)).toBeTruthy();
    expect(within(t).queryByText("audit.retention_days")).toBeNull();
  });
  it("the general tab no longer lists collab keys", async () => {
    open({ path: "/settings/general" });
    expect(await screen.findByText("audit.retention_days")).toBeTruthy();
    expect(screen.queryByText("collab.base_domain")).toBeNull();
  });
  it("saves an integer within its range and refuses one outside it", async () => {
    const { settings } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit collab.max_body_mb" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.clear(d.getByLabelText("Value"));
    await userEvent.type(d.getByLabelText("Value"), "500");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/100 or less/)).toBeTruthy();
    expect(settings.put).not.toHaveBeenCalled();
    await userEvent.clear(d.getByLabelText("Value"));
    await userEvent.type(d.getByLabelText("Value"), "20");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(settings.put).toHaveBeenCalled());
    expect(settings.put.mock.calls[0]?.[1]).toBe(20);
  });
  it("confirmations: base domain, public endpoints off, content scan off", async () => {
    const { settings } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit collab.base_domain" }));
    let d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Value"), "collab.example.com");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/Every team's Paperclip address changes/)).toBeTruthy();
    expect(settings.put).not.toHaveBeenCalled();
    await userEvent.click(d.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(settings.put).toHaveBeenCalledTimes(1));
    expect(settings.put.mock.calls[0]?.[1]).toBe("collab.example.com");

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit collab.public_endpoints" }),
    );
    d = within(await screen.findByRole("dialog"));
    await userEvent.selectOptions(d.getByLabelText("Value"), "false");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/public endpoint stops within a minute/)).toBeTruthy();
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));

    await userEvent.click(await screen.findByRole("button", { name: "Edit collab.content_scan" }));
    d = within(await screen.findByRole("dialog"));
    await userEvent.selectOptions(d.getByLabelText("Value"), "off");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/no longer be blocked or detected/)).toBeTruthy();
  });
  it("cidr list parsing: one per line, bad lines refused, warning when non-empty", async () => {
    const { settings } = open();
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit collab.allowed_source_cidrs" }),
    );
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Value"), "10.0.0.0/8{enter}nope");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/Not a CIDR range: nope/)).toBeTruthy();
    await userEvent.clear(d.getByLabelText("Value"));
    await userEvent.type(d.getByLabelText("Value"), "10.0.0.0/8{enter}2001:db8::/32");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/blocked by the firewall/)).toBeTruthy();
    await userEvent.click(d.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(settings.put).toHaveBeenCalled());
    expect(settings.put.mock.calls[0]?.[1]).toEqual(["10.0.0.0/8", "2001:db8::/32"]);
  });
  it("endpoint list and csv", async () => {
    const port = fakeCollaborationPort({
      listEndpoints: vi.fn(async () => ({
        items: [
          {
            teamId: "team_1",
            slug: "payments",
            hostname: "payments.collab.example.com",
            webUi: true,
            restApi: false,
            phase: "Ready",
            teamState: "active",
            mayExposeCollaboration: true,
            lastAccessAt: "2026-11-22T09:30:00Z",
          },
        ],
        nextToken: "n2",
      })) as never,
    });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    open({ port });
    const t = await screen.findByRole("table", { name: "Collaboration endpoints" });
    expect(await within(t).findByText("payments.collab.example.com")).toBeTruthy();
    expect(within(t).getByRole("link", { name: "payments" }).getAttribute("href")).toBe(
      "/t/team_1/collaboration",
    );
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(port.listEndpoints).toHaveBeenCalledTimes(2));
    await userEvent.selectOptions(screen.getByLabelText("State"), "Failed");
    await waitFor(() =>
      expect(port.listEndpoints.mock.calls.at(-1)?.[0]).toMatchObject({ state: "Failed" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(port.endpointsCsv).toHaveBeenCalled());
  });
  it("a 403 on the endpoints shows the access-denied alert", async () => {
    const port = fakeCollaborationPort({
      listEndpoints: vi.fn(async () => {
        throw new AppError({
          kind: "access-denied",
          message: "no",
          requiredPermission: "admin:settings",
        });
      }) as never,
    });
    open({ port });
    expect(await screen.findAllByText(/admin:settings/)).toBeTruthy();
  });
  it("hidden for team roles", async () => {
    open({ me: TEAM_ADMIN });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
