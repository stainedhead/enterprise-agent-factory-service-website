import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import { SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { fakeReportsPort, reportsServices } from "../../testing/reports.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSetting,
  fakeIdpPort,
  fakeSettingsPort,
  settingsServices,
} from "../../testing/settings.js";
import {
  aCostTagStatus,
  costTagStatusServices,
  fakeCostTagStatusPort,
  fakeServiceTagsPort,
  fakeTagsPort,
  tagsServices,
} from "../../testing/tags.js";
import { ALL_PERMS, serviceAdminWith } from "../../testing/teams.js";
import S9 from "./index.js";

const ACK = aSetting({
  key: "billing.tag_activation_acknowledged",
  type: "boolean",
  value: false,
  default: false,
  allowed: "true or false",
  min: undefined,
  max: undefined,
  version: 3,
});

function open(
  o: {
    me?: Parameters<typeof renderScreen>[1]["me"];
    tags?: ReturnType<typeof fakeServiceTagsPort>;
    settings?: ReturnType<typeof fakeSettingsPort>;
    reports?: ReturnType<typeof fakeReportsPort>;
    status?: ReturnType<typeof fakeCostTagStatusPort>;
  } = {},
) {
  const tags = o.tags ?? fakeServiceTagsPort();
  const settings = o.settings ?? fakeSettingsPort({ list: async () => [ACK] });
  const reports = o.reports ?? fakeReportsPort();
  renderScreen(<S9 />, {
    me: o.me ?? SERVICE_ADMIN,
    services: {
      ...tagsServices(tags, fakeTagsPort()),
      ...costTagStatusServices(o.status ?? fakeCostTagStatusPort()),
      ...settingsServices(settings, fakeIdpPort()),
      ...reportsServices(reports),
    },
    path: "/cost-tags",
    route: "/cost-tags",
  });
  return { tags, settings, reports };
}

describe("S9 service tags (M4-G1)", () => {
  it("lists system tags read-only, and service tags with edit and remove", async () => {
    open();
    expect(await screen.findByText("afs-team-id")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit afs-team-id" })).toBeNull();
    expect(await screen.findByRole("button", { name: "Edit environment" })).toBeTruthy();
    expect(await screen.findByText("prod, dev")).toBeTruthy();
  });
  it("adds a fixed service tag", async () => {
    const { tags } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add service tag" }));
    const d = screen.getByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Key"), "owner");
    await userEvent.selectOptions(within(d).getByLabelText("Kind"), "fixed");
    await userEvent.type(within(d).getByLabelText("Value"), "platform");
    await userEvent.click(within(d).getByRole("button", { name: "Add tag" }));
    await waitFor(() =>
      expect(tags.put).toHaveBeenCalledWith("owner", undefined, {
        mode: "fixed",
        value: "platform",
      }),
    );
  });
  it("refuses a reserved key on the field", async () => {
    const { tags } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add service tag" }));
    const d = screen.getByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Key"), "afs-x");
    await userEvent.click(within(d).getByRole("button", { name: "Add tag" }));
    expect(await within(d).findByText(/reserved/)).toBeTruthy();
    expect(tags.put).not.toHaveBeenCalled();
  });
  it("edits with the version it read and removes after confirming", async () => {
    const { tags } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit environment" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(tags.put).toHaveBeenCalled());
    expect(tags.put.mock.calls[0]?.slice(0, 2)).toEqual(["environment", 2]);
    await userEvent.click(await screen.findByRole("button", { name: "Remove region" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() => expect(tags.delete).toHaveBeenCalledWith("region", 1));
  });
  it("lists the teams missing a required value with links", async () => {
    open();
    const link = await screen.findByRole("link", { name: "Gamma" });
    expect(link.getAttribute("href")).toBe("/t/team_9/tags");
  });
});

describe("S9 spend by tag tag-keys failure (FR-019)", () => {
  it("shows an inline alert with the request id while the report stays usable, and Retry re-runs the query", async () => {
    const tags = fakeServiceTagsPort();
    tags.list.mockRejectedValue(
      new AppError({ kind: "validation", message: "tags broken", requestId: "req_svc_tags" }),
    );
    const { reports } = open({ tags });
    const title = await screen.findByText("Tag keys could not be loaded");
    const alert = title.closest('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain("req_svc_tags");
    expect(await screen.findByLabelText("Group by")).toBeTruthy();
    await waitFor(() => expect(reports.run).toHaveBeenCalled());
    const before = tags.list.mock.calls.length;
    tags.list.mockResolvedValue([]);
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(tags.list.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByText("Tag keys could not be loaded")).toBeNull());
  });
  it("shows no inline alert when the API denies access", async () => {
    const tags = fakeServiceTagsPort();
    tags.list.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "no", requestId: "req_403" }),
    );
    open({ tags });
    await waitFor(() => expect(tags.list).toHaveBeenCalled());
    await screen.findByLabelText("Group by");
    expect(screen.queryByText("Tag keys could not be loaded")).toBeNull();
  });
});

describe("S9 spend by tag (M4-G2)", () => {
  it("offers the service tag keys to group the cost report by", async () => {
    const { reports } = open();
    await screen.findAllByText("Spend by tag");
    const group = await screen.findByLabelText("Group by");
    await userEvent.selectOptions(group, "tag:environment");
    await waitFor(() => expect(reports.run).toHaveBeenCalled());
    await waitFor(() =>
      expect(reports.run.mock.calls.some((c) => c[2].groupBy?.includes("tag:environment"))).toBe(
        true,
      ),
    );
  });
});

describe("S9 activation banner and access (M4-G3)", () => {
  it("shows the notice until acknowledged, then sets the setting", async () => {
    const { settings } = open();
    await screen.findByText(/Activate the service and system tags/);
    await userEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() =>
      expect(settings.put).toHaveBeenCalledWith(
        { key: "billing.tag_activation_acknowledged", version: 3 },
        true,
      ),
    );
  });
  it("shows no notice once acknowledged", async () => {
    open({ settings: fakeSettingsPort({ list: async () => [{ ...ACK, value: true }] }) });
    await screen.findByText("afs-team-id");
    expect(screen.queryByText(/Activate the service and system tags/)).toBeNull();
  });
  it("disables Add and Acknowledge naming the permission when the caller lacks it", async () => {
    open({ me: serviceAdminWith([]) });
    const add = await screen.findByRole("button", { name: "Add service tag" });
    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(
      (await screen.findByRole("button", { name: "Acknowledge" })).getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("is not found for a team role", () => {
    open({ me: TEAM_ADMIN });
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
  it("shows the API's access denied for a failing change", async () => {
    const tags = fakeServiceTagsPort();
    tags.delete.mockRejectedValue(
      new AppError({
        kind: "access-denied",
        message: "Requires admin:service-tags",
        requestId: "r",
      }),
    );
    open({ tags });
    await userEvent.click(await screen.findByRole("button", { name: "Remove region" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});

describe("S9 tag status (M5-T1)", () => {
  it("shows each key with its seen, first, last and AWS activation, and flags an unseen active key", async () => {
    const status = fakeCostTagStatusPort({
      list: async () => [
        aCostTagStatus(),
        aCostTagStatus({
          key: "environment",
          seenInCur: false,
          lastSeenAt: "2026-11-10T00:00:00Z",
        }),
        aCostTagStatus({ key: "cost-center", seenInCur: false, awsStatus: "inactive" }),
      ],
    });
    open({ status });
    const table = await screen.findByRole("table", { name: "Tag status" });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(4));
    expect(within(table).getByText("Healthy")).toBeTruthy();
    expect(within(table).getByText("Not seen in report")).toBeTruthy();
    expect(within(table).getByText("Not active")).toBeTruthy();
    const alert = await screen.findByText(/not seen for 3 days or more/i);
    expect(alert.textContent).toContain("environment");
    expect(alert.textContent).not.toContain("cost-center");
  });
  it("does not ask for tag status without the permission", async () => {
    const status = fakeCostTagStatusPort();
    open({ me: serviceAdminWith(ALL_PERMS.filter((p) => p !== "admin:cost-tag-status")), status });
    await screen.findByRole("table", { name: "System tags" });
    expect(status.list).not.toHaveBeenCalled();
    expect(screen.queryByText("Tag status")).toBeNull();
  });
  it("reports a refused read", async () => {
    const status = fakeCostTagStatusPort({
      list: async () => {
        throw new AppError({ kind: "access-denied", message: "Nope" });
      },
    });
    open({ status });
    expect(await screen.findByText(/Nope/)).toBeTruthy();
  });
});
