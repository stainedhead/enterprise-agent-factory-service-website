import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { SERVICE_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  status,
  teamsServices,
} from "../../testing/teams.js";
import { TeamsPage } from "./TeamsPage.js";

afterEach(() => vi.useRealTimers());

const open = (port = fakeTeamsPort(), me = SERVICE_ADMIN, path = "/teams") => ({
  port,
  ...renderScreen(<TeamsPage />, { me, services: teamsServices(port), path, route: "/teams" }),
});

async function selectRow(slug: string) {
  const row = (await screen.findByText(slug)).closest("tr") as HTMLElement;
  await userEvent.click(within(row).getByRole("radio"));
}
const menu = async (item: string) => {
  await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
};

describe("S2 teams table (M1-T2)", () => {
  it("shows slug, kind, state, spend against budget, cost center and expiry for ephemeral teams", async () => {
    const port = fakeTeamsPort({
      list: vi.fn(async () => ({
        items: [
          aTeam(),
          aTeam({
            id: "team_2",
            slug: "scratch",
            kind: "ephemeral",
            expiresAt: "2026-12-01T10:00:00Z",
            costCenter: "CC-9",
            status: status("Reconciling"),
          }),
        ],
      })),
    });
    open(port);
    expect(await screen.findByText("alpha")).toBeTruthy();
    const row1 = screen.getByText("alpha").closest("tr") as HTMLElement;
    expect(within(row1).getByText("Persistent")).toBeTruthy();
    expect(within(row1).getByText("Ready")).toBeTruthy();
    expect(row1.textContent).toContain("$250.00 / $1,000.00");
    expect(row1.textContent).toContain("CC-1");
    const row2 = screen.getByText("scratch").closest("tr") as HTMLElement;
    expect(within(row2).getByText("Reconciling")).toBeTruthy();
    expect(row2.querySelector("time")).toBeTruthy();
    expect(row1.querySelector("time")).toBeNull();
    // one list and one report request for the page
    expect(port.list).toHaveBeenCalledTimes(1);
    expect(port.spendByTeam).toHaveBeenCalledTimes(1);
  });

  it("filters by kind and state on the server", async () => {
    const { port } = open();
    await screen.findByText("alpha");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "ephemeral");
    await waitFor(() =>
      expect(port.list).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "ephemeral" })),
    );
    await userEvent.selectOptions(screen.getByLabelText("State"), "suspended");
    await waitFor(() =>
      expect(port.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "ephemeral", state: "suspended" }),
      ),
    );
  });

  it("?view=budgets shows the budget, ceiling and temporary ceiling columns with the end date", async () => {
    const port = fakeTeamsPort({
      list: vi.fn(async () => ({
        items: [
          aTeam({
            ceilingOverrideUsd: "7500.00",
            ceilingOverrideExpiresAt: "2099-12-01T00:00:00Z",
            effectiveCeilingUsd: "7500.00",
          }),
        ],
      })),
    });
    open(port, SERVICE_ADMIN, "/teams?view=budgets");
    expect(await screen.findByRole("columnheader", { name: "Temporary ceiling" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Effective ceiling" })).toBeTruthy();
    const row = (await screen.findByText("alpha")).closest("tr") as HTMLElement;
    expect(row.textContent).toContain("Ceiling $7,500.00 until");
  });

  it("pages with the server token", async () => {
    const list = vi.fn(async (q: { nextToken?: string }) =>
      q.nextToken
        ? { items: [aTeam({ id: "team_9", slug: "page-two" })] }
        : { items: [aTeam()], nextToken: "tok2" },
    );
    open(fakeTeamsPort({ list }));
    await screen.findByText("alpha");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("page-two")).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ nextToken: "tok2" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(await screen.findByText("alpha")).toBeTruthy();
  });

  it("M1-T7: a team shown Reconciling turns Ready by polling, without a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let phase = "Reconciling";
    const port = fakeTeamsPort({
      list: vi.fn(async () => ({ items: [aTeam({ status: status(phase) })] })),
    });
    open(port);
    expect(await screen.findByText("Reconciling")).toBeTruthy();
    phase = "Ready";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });
    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(port.list).toHaveBeenCalledTimes(2);
  });
});

describe("S2 actions (M1-T3)", () => {
  it("Suspend confirms and calls the API, then refreshes", async () => {
    const { port } = open();
    await selectRow("alpha");
    await menu("Suspend");
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(port.suspend).toHaveBeenCalledWith("team_1"));
    await waitFor(() => expect(port.list.mock.calls.length).toBeGreaterThan(1));
  });

  it("Resume is available only for a suspended team", async () => {
    const port = fakeTeamsPort({
      list: vi.fn(async () => ({ items: [aTeam({ state: "suspended" })] })),
    });
    open(port);
    expect(await screen.findByText("Suspended")).toBeTruthy();
    await selectRow("alpha");
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menuitem", { name: "Suspend" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Resume" }));
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(port.resume).toHaveBeenCalledWith("team_1"));
  });

  it("Delete needs the slug typed", async () => {
    const { port } = open();
    await selectRow("alpha");
    await menu("Delete");
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del.getAttribute("aria-disabled")).toBe("true");
    await userEvent.type(screen.getByLabelText(/Type/), "alpha");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(port.delete).toHaveBeenCalledWith({ id: "team_1", version: 3 }));
  });

  it("Set ceiling shows the API's ValidationError below the budget and keeps the input", async () => {
    const port = fakeTeamsPort({
      update: vi.fn(async () => {
        throw new AppError({
          kind: "validation",
          message: "Ceiling is below the budget",
          fields: { maxBudgetUsd: "Must be at least 1000.00" },
          requestId: "req_7",
        });
      }),
    });
    open(port);
    await selectRow("alpha");
    await menu("Set ceiling");
    await userEvent.type(screen.getByLabelText("Ceiling (USD)"), "10.00");
    await userEvent.click(screen.getByRole("button", { name: "Set ceiling" }));
    expect(await screen.findByText("Must be at least 1000.00")).toBeTruthy();
    expect(screen.getByText(/Request id: req_7/)).toBeTruthy();
    expect((screen.getByLabelText("Ceiling (USD)") as HTMLInputElement).value).toBe("10.00");
    expect(port.update).toHaveBeenCalledWith(
      { id: "team_1", version: 3 },
      { maxBudgetUsd: "10.00" },
    );
  });

  it("Raise ceiling temporarily sends amount, expiry and reason", async () => {
    const { port } = open();
    await selectRow("alpha");
    await menu("Raise ceiling temporarily");
    await userEvent.type(screen.getByLabelText("Temporary ceiling (USD)"), "7500.00");
    await userEvent.type(screen.getByLabelText("Until"), "2026-12-01T10:00");
    await userEvent.type(screen.getByLabelText("Reason"), "launch week");
    await userEvent.click(screen.getByRole("button", { name: "Raise ceiling" }));
    await waitFor(() => expect(port.update).toHaveBeenCalled());
    expect(port.update.mock.calls[0]?.[1]).toMatchObject({
      ceilingOverrideUsd: "7500.00",
      ceilingOverrideReason: "launch week",
    });
  });

  it("a missing reason is a validation error shown on the field", async () => {
    const { port } = open();
    await selectRow("alpha");
    await menu("Raise ceiling temporarily");
    await userEvent.type(screen.getByLabelText("Temporary ceiling (USD)"), "7500.00");
    await userEvent.type(screen.getByLabelText("Until"), "2026-12-01T10:00");
    await userEvent.click(screen.getByRole("button", { name: "Raise ceiling" }));
    expect(
      (await screen.findAllByText("Enter a reason; it goes to the audit log")).length,
    ).toBeGreaterThan(0);
    expect(port.update).not.toHaveBeenCalled();
  });

  it("a failed Suspend shows the error with the request id", async () => {
    const port = fakeTeamsPort({
      suspend: vi.fn(async () => {
        throw new AppError({
          kind: "stale",
          message: "Changed since you opened it",
          requestId: "req_3",
        });
      }),
    });
    open(port);
    await selectRow("alpha");
    await menu("Suspend");
    await userEvent.click(screen.getByRole("button", { name: "Suspend" }));
    expect(await screen.findByText("Changed since you opened it")).toBeTruthy();
    expect(screen.getByText(/Request id: req_3/)).toBeTruthy();
  });

  it("without a selection every action is disabled and says to select a team", async () => {
    open();
    await screen.findByText("alpha");
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    for (const n of ["Suspend", "Resume", "Set ceiling", "Raise ceiling temporarily", "Delete"])
      expect(screen.getByRole("menuitem", { name: n }).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("S2 permissions (denied cases)", () => {
  const without = (p: string) => serviceAdminWith(ALL_PERMS.filter((x) => x !== p));

  it.each([
    ["teams:suspend", "Suspend"],
    ["teams:suspend", "Resume"],
    ["teams:set-guardrails", "Set ceiling"],
    ["teams:set-guardrails", "Raise ceiling temporarily"],
    ["teams:delete", "Delete"],
  ])("%s missing disables %s with the role needed", async (perm, item) => {
    const api = fakeTeamsPort();
    open(api, without(perm));
    await selectRow("alpha");
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    const el = screen.getByRole("menuitem", { name: item });
    expect(el.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(el);
    expect(api.suspend).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("teams:create missing disables Create team with a tooltip", async () => {
    open(fakeTeamsPort(), without("teams:create"));
    await screen.findByText("alpha");
    const b = screen.getByRole("button", { name: "Create team" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await userEvent.tab();
    b.focus();
    expect((await screen.findByRole("tooltip")).textContent).toBe("Requires service admin");
  });
});

describe("S2 states (M1-T4)", () => {
  it("a deleted team shows Deleted with usage, cost and history links", async () => {
    const port = fakeTeamsPort({
      list: vi.fn(async () => ({ items: [aTeam({ state: "deleted" })] })),
    });
    open(port);
    const row = (await screen.findByText("alpha")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Deleted")).toBeTruthy();
    expect(within(row).getByRole("link", { name: "Usage" }).getAttribute("href")).toBe(
      "/t/team_1/budget",
    );
    expect(within(row).getByRole("link", { name: "Cost" })).toBeTruthy();
    expect(within(row).getByRole("link", { name: "History" }).getAttribute("href")).toBe(
      "/t/team_1/history/audit",
    );
  });

  it("a list failure shows the error with its request id", async () => {
    const port = fakeTeamsPort({
      list: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "boom", requestId: "req_list" });
      }),
    });
    open(port);
    expect(await screen.findByText("boom")).toBeTruthy();
    expect(screen.getByText(/Request id: req_list/)).toBeTruthy();
  });
});
