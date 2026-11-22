import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import {
  adminExportsServices,
  anExport,
  fakeAdminExportsPort,
} from "../../testing/adminExports.js";
import { SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import S11 from "./index.js";

function open(me = SERVICE_ADMIN, port = fakeAdminExportsPort()) {
  renderScreen(<S11 />, {
    me,
    services: adminExportsServices(port),
    path: "/export-import",
    route: "/export-import",
  });
  return port;
}

const file = (text: string, name = "bundle.json") =>
  new File([text], name, { type: "application/json" });

describe("S11 exports (M4-E1)", () => {
  it("lists exports with size, checksum and a download link, and notes that no secrets are included", async () => {
    open();
    expect(await screen.findByText("2.0 KB")).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Download export exp_1" }).getAttribute("href")).toBe(
      "https://dl.example.test/x",
    );
    expect(screen.getByText(/secret values are never exported/)).toBeTruthy();
  });
  it("shows an export past its 7 days as expired, with no link", async () => {
    open(
      SERVICE_ADMIN,
      fakeAdminExportsPort({
        list: async () => [anExport({ downloadExpiresAt: "2020-01-01T00:00:00Z" })],
      }),
    );
    expect(await screen.findByText("Expired")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Download export/ })).toBeNull();
  });
  it("shows a dash, not Expired and not a link, when the adapter dropped an unsafe download URL (FR-020)", async () => {
    open(
      SERVICE_ADMIN,
      fakeAdminExportsPort({ list: async () => [anExport({ downloadUrl: undefined })] }),
    );
    await screen.findByText("abc123");
    expect(screen.queryByText("Expired")).toBeNull();
    expect(screen.queryByRole("link", { name: /Download export/ })).toBeNull();
    expect((await screen.findByText("abc123")).closest("tr")?.textContent).toMatch(/—$/);
  });
  it("creates an export and shows it preparing", async () => {
    const port = open(
      SERVICE_ADMIN,
      fakeAdminExportsPort({
        list: async () => [anExport({ status: "running", downloadUrl: undefined })],
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Create export" }));
    await waitFor(() => expect(port.create).toHaveBeenCalledWith([]));
    expect(await screen.findByText(/Preparing the bundle/)).toBeTruthy();
  });
  it("shows a failed export with its error", async () => {
    open(
      SERVICE_ADMIN,
      fakeAdminExportsPort({
        list: async () => [
          anExport({ status: "failed", error: "Out of space", downloadUrl: undefined }),
        ],
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("Out of space");
  });
  it("is not found for a team role", () => {
    open(TEAM_ADMIN);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});

describe("S11 import (M4-E2)", () => {
  it("keeps Apply disabled until a dry run of the same inputs, then confirms", async () => {
    const port = open();
    const input = await screen.findByLabelText("Bundle file");
    await userEvent.upload(input, file('{"schemaVersion":1,"teams":[]}'));
    const apply = screen.getByRole("button", { name: "Apply" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dry run" }).getAttribute("aria-disabled"),
      ).not.toBe("true"),
    );
    expect(apply.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Dry run" }));
    expect(await screen.findByText("agents +1")).toBeTruthy();
    expect(port.importBundle.mock.calls[0]?.[1]).toBe(true);
    expect(screen.getByText("Unknown model")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Apply" }).getAttribute("aria-disabled")).not.toBe(
        "true",
      ),
    );
    // changing the account map invalidates the dry run
    await userEvent.type(screen.getByLabelText("Account map"), "111122223333=444455556666");
    expect(screen.getByRole("button", { name: "Apply" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.queryByText("agents +1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Dry run" }));
    await screen.findByText("agents +1");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply" }),
    );
    await waitFor(() => expect(port.importBundle).toHaveBeenCalledTimes(3));
    expect(port.importBundle.mock.calls[2]?.[1]).toBe(false);
  });
  it("refuses a malformed file and a bad account map without a request", async () => {
    const port = open();
    await userEvent.upload(await screen.findByLabelText("Bundle file"), file("nope"));
    expect(await screen.findByText(/not valid JSON/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dry run" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await userEvent.upload(screen.getByLabelText("Bundle file"), file("{}"));
    await userEvent.type(screen.getByLabelText("Account map"), "1=2");
    expect(await screen.findByText(/not <source account id>/)).toBeTruthy();
    expect(port.importBundle).not.toHaveBeenCalled();
  });
  it("refuses a bundle over 100 MB before reading it", async () => {
    const port = open();
    const big = new File(["{}"], "big.json", { type: "application/json" });
    Object.defineProperty(big, "size", { value: 100 * 1024 * 1024 + 1 });
    await userEvent.upload(await screen.findByLabelText("Bundle file"), big);
    expect(await screen.findByText(/larger than 100 MB/)).toBeTruthy();
    expect(port.importBundle).not.toHaveBeenCalled();
  });
  it("shows the API's access denied for an import", async () => {
    const port = fakeAdminExportsPort();
    port.importBundle.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires admin:export", requestId: "r" }),
    );
    open(SERVICE_ADMIN, port);
    await userEvent.upload(await screen.findByLabelText("Bundle file"), file("{}"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dry run" }).getAttribute("aria-disabled"),
      ).not.toBe("true"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Dry run" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
