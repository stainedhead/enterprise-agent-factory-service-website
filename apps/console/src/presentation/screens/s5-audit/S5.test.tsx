import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { adminAuditServices, anAdminEvent, fakeAdminAuditPort } from "../../testing/adminAudit.js";
import { SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import S5 from "./index.js";

function open(me = SERVICE_ADMIN, port = fakeAdminAuditPort(), path = "/audit") {
  renderScreen(<S5 />, { me, services: adminAuditServices(port), path, route: "/audit" });
  return port;
}

describe("S5 audit (M4-A1)", () => {
  it("lists events across teams", async () => {
    open();
    expect(await screen.findByText("req_1")).toBeTruthy();
    expect(screen.getByText("teams.suspend")).toBeTruthy();
  });
  it("sends the filters from the URL as API parameters", async () => {
    const port = open(SERVICE_ADMIN, fakeAdminAuditPort(), "/audit?outcome=denied&teamId=team_9");
    await waitFor(() => expect(port.list).toHaveBeenCalled());
    expect(port.list.mock.calls[0]?.[0]).toEqual({ outcome: "denied", teamId: "team_9" });
  });
  it("is not found for a team role", () => {
    open(TEAM_ADMIN);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});

describe("S5 notes (M4-A2)", () => {
  it("shows Denied with the permission required", async () => {
    open(
      SERVICE_ADMIN,
      fakeAdminAuditPort({
        list: async () => ({
          items: [
            anAdminEvent({ outcome: "denied", after: { requiredPermission: "teams:write" } }),
          ],
        }),
      }),
    );
    expect(await screen.findByText("Denied")).toBeTruthy();
    expect(screen.getByText("teams:write")).toBeTruthy();
  });
  it("shows Drift corrected with the object", async () => {
    open(
      SERVICE_ADMIN,
      fakeAdminAuditPort({
        list: async () => ({
          items: [
            anAdminEvent({ action: "drift.corrected", resourceKind: "agent", resourceId: "agt_7" }),
          ],
        }),
      }),
    );
    expect(await screen.findByText("Drift corrected")).toBeTruthy();
    expect(screen.getAllByText("agent agt_7").length).toBe(2);
  });
});

describe("S5 CSV (M4-A3)", () => {
  it("downloads the CSV for the current filters", async () => {
    const port = open(SERVICE_ADMIN, fakeAdminAuditPort(), "/audit?action=x");
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => undefined;
    await userEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(port.csv).toHaveBeenCalled());
    expect(port.csv.mock.calls[0]?.[0]).toEqual({ action: "x" });
  });
  it("shows the API's access denied for the download", async () => {
    const { AppError } = await import("../../../application/errors.js");
    const port = fakeAdminAuditPort({
      csv: async () => {
        throw new AppError({
          kind: "access-denied",
          message: "Requires admin:audit",
          requestId: "r",
        });
      },
    });
    open(SERVICE_ADMIN, port);
    await userEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
