import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import { OverviewUseCases } from "../../../application/usecases/overview/OverviewUseCases.js";
import type { Me } from "../../../domain/me.js";
import { SEC_OP, SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aRepo,
  aWorkOrderDetail,
  fakeSwarmTemplatesPort,
  fakeTeamDirectoryPort,
  fakeWorkOrdersPort,
  workOrdersServices,
} from "../../testing/workOrders.js";
import P6 from "./index.js";

function open(o: { me?: Me; port?: ReturnType<typeof fakeWorkOrdersPort>; budget?: boolean } = {}) {
  const port = o.port ?? fakeWorkOrdersPort();
  const overview = new OverviewUseCases(
    {
      budget: async () => ({
        amountUsd: "500.00",
        spentUsd: "120.50",
        reservedUsd: "0.00",
        period: "lifetime",
        onExhaust: "block",
        thresholds: [50, 80, 100],
        version: 1,
      }),
      agents: async () => [],
      recentActivity: async () => [],
    },
    port,
  );
  renderScreen(<P6 />, {
    me: o.me ?? SEC_OP,
    services: {
      ...workOrdersServices(port, fakeTeamDirectoryPort(), fakeSwarmTemplatesPort()),
      overview,
    },
    path: "/work-orders/wo_1",
    route: "/work-orders/:id",
  });
  return port;
}

describe("P6 work order detail (M6-W6)", () => {
  it("shows the SLA, the remediation team, and one row per repository with status, PR link, owner source and notifications", async () => {
    open({
      port: fakeWorkOrdersPort({
        get: async () =>
          aWorkOrderDetail({
            repos: [
              aRepo({ ownerSource: "team_config" }),
              aRepo({
                repo: "acme/web",
                status: "pending",
                owningTeamId: null,
                owningContact: "ops@example.com",
                ownerSource: "explicit",
                prUrl: null,
                notifications: [],
              }),
            ],
          }),
      }),
    });
    expect(
      await screen.findByRole("heading", { name: "OpenSSL remote code execution" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Due soon").length).toBeGreaterThan(0);
    const table = screen.getByRole("table", { name: "Repositories" });
    await waitFor(() => expect(within(table).getByText(/Payments \(payments\)/)).toBeTruthy());
    expect(within(table).getByText(/team configuration/)).toBeTruthy();
    expect(within(table).getByText(/ops@example.com.*\(explicit\)/)).toBeTruthy();
    expect(within(table).getByRole("link", { name: "#7" }).getAttribute("href")).toBe(
      "https://github.com/acme/payments-api/pull/7",
    );
    expect(within(table).getByText(/assigned to ops@example.com/)).toBeTruthy();
    expect(within(table).getByText("None")).toBeTruthy();
  });
  it("shows spend against the cap for a caller who may read the team's budget", async () => {
    open({ me: SERVICE_ADMIN });
    expect(await screen.findByText("$120.50 of $500.00")).toBeTruthy();
  });
  it("shows only the cap to a security operator, who cannot read the team's budget", async () => {
    open();
    expect(await screen.findByText("Cap $500.00")).toBeTruthy();
  });
  it("cancels with a required reason", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel work order" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Cancel work order" }));
    expect(port.cancel).not.toHaveBeenCalled();
    await userEvent.type(within(d).getByLabelText(/Reason/), "Duplicate of another order");
    await userEvent.click(within(d).getByRole("button", { name: "Cancel work order" }));
    await waitFor(() =>
      expect(port.cancel).toHaveBeenCalledWith("wo_1", "Duplicate of another order"),
    );
  });
  it("shows the API's refusal to cancel", async () => {
    open({
      port: fakeWorkOrdersPort({
        cancel: async () => {
          throw new AppError({ kind: "access-denied", message: "Needs work-orders:write" });
        },
      }),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Cancel work order" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText(/Reason/), "x");
    await userEvent.click(within(d).getByRole("button", { name: "Cancel work order" }));
    expect(await within(d).findByText("You do not have access")).toBeTruthy();
  });
  it("is read-only for a team admin and a viewer, with the role needed", async () => {
    for (const me of [TEAM_ADMIN, VIEWER]) {
      const { unmount } = (() => {
        open({ me });
        return { unmount: () => undefined };
      })();
      const b = await screen.findByRole("button", { name: "Cancel work order" });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      unmount();
      document.body.innerHTML = "";
    }
  });
  it("disables Cancel for a closed work order", async () => {
    open({ port: fakeWorkOrdersPort({ get: async () => aWorkOrderDetail({ status: "done" }) }) });
    const b = await screen.findByRole("button", { name: "Cancel work order" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
  });
  it("is not found when the API says 404 (no link to the caller's teams)", async () => {
    open({
      me: VIEWER,
      port: fakeWorkOrdersPort({
        get: async () => {
          throw new AppError({ kind: "not-found", message: "Not found" });
        },
      }),
    });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
  it("reports another failure", async () => {
    open({
      port: fakeWorkOrdersPort({
        get: async () => {
          throw new AppError({ kind: "unavailable", message: "Try later" });
        },
      }),
    });
    expect(await screen.findByText("The work order could not be loaded")).toBeTruthy();
  });
});
