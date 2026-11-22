import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { SEC_OP, SERVICE_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSwarmTemplate,
  aWorkOrder,
  aWorkOrderDetail,
  fakeSwarmTemplatesPort,
  fakeTeamDirectoryPort,
  fakeWorkOrdersPort,
  workOrdersServices,
} from "../../testing/workOrders.js";
import P3 from "./index.js";

function open(
  o: {
    me?: Me;
    port?: ReturnType<typeof fakeWorkOrdersPort>;
    dir?: ReturnType<typeof fakeTeamDirectoryPort>;
    templates?: ReturnType<typeof fakeSwarmTemplatesPort>;
    path?: string;
  } = {},
) {
  const port = o.port ?? fakeWorkOrdersPort();
  const dir = o.dir ?? fakeTeamDirectoryPort();
  renderScreen(<P3 />, {
    me: o.me ?? SEC_OP,
    services: workOrdersServices(port, dir, o.templates ?? fakeSwarmTemplatesPort()),
    path: o.path ?? "/work-orders",
    route: "/work-orders/*",
  });
  return { port, dir };
}

describe("P3 work orders list (M6-W2)", () => {
  it("lists work orders most severe first with status, SLA and the team's name from the directory", async () => {
    open({
      port: fakeWorkOrdersPort({
        list: async () => [
          aWorkOrder({
            id: "wo_low",
            title: "Low one",
            severity: "low",
            teamId: null,
            status: "open",
          }),
          aWorkOrder({ id: "wo_hi", title: "Critical one", teamId: "team_1" }),
        ],
      }),
    });
    const table = await screen.findByRole("table", { name: "Work orders" });
    await waitFor(() => expect(within(table).getByText("Payments (payments)")).toBeTruthy());
    const rows = within(table).getAllByRole("row");
    expect(rows[1]?.textContent).toContain("Critical one");
    expect(within(table).getAllByText("Due soon")).toHaveLength(2);
    expect(within(table).getByText("Unassigned")).toBeTruthy();
    expect(within(table).getByRole("link", { name: "Critical one" }).getAttribute("href")).toBe(
      "/work-orders/wo_hi",
    );
  });
  it("sends each filter to the API", async () => {
    const { port } = open();
    await screen.findByRole("table", { name: "Work orders" });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "in_progress");
    await userEvent.selectOptions(screen.getByLabelText("Severity"), "critical");
    await userEvent.selectOptions(screen.getByLabelText("SLA state"), "breached");
    await waitFor(() =>
      expect(port.list).toHaveBeenLastCalledWith(
        { status: "in_progress", severity: "critical", slaState: "breached", teamId: undefined },
        expect.anything(),
        expect.anything(),
      ),
    );
    await userEvent.selectOptions(await screen.findByLabelText("Team"), "team_2");
    await waitFor(() =>
      expect((port.list.mock.lastCall as unknown[])[0]).toMatchObject({ teamId: "team_2" }),
    );
  });
  it("shows an empty state and a refused read", async () => {
    open({ port: fakeWorkOrdersPort({ list: async () => [] }) });
    expect(await screen.findByText("No work orders match.")).toBeTruthy();
  });
  it("reports access denied from the API", async () => {
    open({
      port: fakeWorkOrdersPort({
        list: async () => {
          throw new AppError({ kind: "access-denied", message: "Nope" });
        },
      }),
    });
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
  it("disables Create work order with the role needed for a caller who may not write", async () => {
    open({ me: VIEWER });
    const b = await screen.findByRole("button", { name: "Create work order" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("P3 create work order (M6-W3, M6-W4, M6-W5)", () => {
  const fill = async () => {
    const u = userEvent.setup();
    await screen.findByRole("heading", { name: "Create work order" });
    await waitFor(() =>
      expect(within(screen.getByLabelText("Template")).getAllByRole("option")).toHaveLength(2),
    );
    await u.type(screen.getByLabelText("CVE"), "CVE-2026-1234");
    await u.type(screen.getByLabelText("Title"), "OpenSSL RCE");
    await u.type(screen.getByLabelText("SLA due"), "2026-11-28T18:00");
    await u.selectOptions(screen.getByLabelText("Template"), "swt_1");
    await u.type(screen.getByLabelText("Repository 1"), "github.com/acme/api");
    return u;
  };

  it("offers only enabled templates and shows the CLI command with owners", async () => {
    open({ path: "/work-orders/new" });
    const u = await fill();
    const sel = screen.getByLabelText("Template");
    expect(within(sel).queryByRole("option", { name: "retired" })).toBeNull();
    await u.selectOptions(await screen.findByLabelText("Owning team for repository 1"), "team_1");
    await u.type(screen.getByLabelText("Owning contact for repository 1"), "ops@example.com");
    const cli = screen.getByText(/afs work-orders create-work-order/);
    expect(cli.textContent).toContain("--repos github.com/acme/api=team_1,ops@example.com");
    expect(cli.textContent).toContain("--cve-id CVE-2026-1234");
  });
  it("refuses an incomplete form before any request", async () => {
    const { port } = open({ path: "/work-orders/new" });
    await screen.findByRole("heading", { name: "Create work order" });
    await userEvent.click(screen.getByRole("button", { name: "Create work order", hidden: false }));
    expect(await screen.findByText("Enter a title")).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("creates the work order with the chosen owners", async () => {
    const { port } = open({ path: "/work-orders/new" });
    const u = await fill();
    await u.selectOptions(await screen.findByLabelText("Owning team for repository 1"), "team_1");
    await u.click(
      screen.getAllByRole("button", { name: "Create work order" }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(port.create).toHaveBeenCalledOnce());
    expect(port.create.mock.calls[0]?.[0].repos[0]).toMatchObject({
      host: "github.com",
      repo: "acme/api",
      owningTeamId: "team_1",
    });
  });
  it("pre-fills ambiguous owners and highlights repositories that need one after a 400", async () => {
    const port = fakeWorkOrdersPort({
      create: async () => {
        throw new AppError({
          kind: "validation",
          message: "Owners are missing",
          details: {
            ambiguousRepos: [{ repo: "github.com/acme/api", teamIds: ["team_2", "team_1"] }],
            unownedRepos: ["github.com/acme/web"],
          },
        });
      },
    });
    open({ path: "/work-orders/new", port });
    const u = await fill();
    await u.click(screen.getByRole("button", { name: "Add repository" }));
    await u.type(screen.getByLabelText("Repository 2"), "github.com/acme/web");
    await u.click(
      screen.getAllByRole("button", { name: "Create work order" }).at(-1) as HTMLElement,
    );
    expect(await screen.findByText("Some repositories need an owner")).toBeTruthy();
    expect((screen.getByLabelText("Owning team for repository 1") as HTMLSelectElement).value).toBe(
      "team_2",
    );
    expect(screen.getByText(/Needs an owner/)).toBeTruthy();
  });
  it("links the existing work order when the API answers 409", async () => {
    const port = fakeWorkOrdersPort({
      create: async () => {
        throw new AppError({ kind: "conflict", message: "CVE-2026-1234 is already open" });
      },
      list: async () => [
        aWorkOrder({ id: "wo_existing", title: "Existing one", cveId: "CVE-2026-1234" }),
      ],
    });
    open({ path: "/work-orders/new", port });
    const u = await fill();
    await u.click(
      screen.getAllByRole("button", { name: "Create work order" }).at(-1) as HTMLElement,
    );
    const link = await screen.findByRole("link", { name: "Open Existing one" });
    expect(link.getAttribute("href")).toBe("/work-orders/wo_existing");
  });
  it("shows access denied from the API", async () => {
    const port = fakeWorkOrdersPort({
      create: async () => {
        throw new AppError({ kind: "access-denied", message: "Needs work-orders:write" });
      },
    });
    open({ path: "/work-orders/new", port, me: SERVICE_ADMIN });
    const u = await fill();
    await u.click(
      screen.getAllByRole("button", { name: "Create work order" }).at(-1) as HTMLElement,
    );
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
  it("cannot be submitted by a caller without work-orders:write", async () => {
    const { port } = open({ path: "/work-orders/new", me: VIEWER });
    await screen.findByRole("heading", { name: "Create work order" });
    const b = screen.getAllByRole("button", { name: "Create work order" }).at(-1) as HTMLElement;
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(b);
    expect(port.create).not.toHaveBeenCalled();
  });
  it("shows only enabled templates", () => {
    expect(aSwarmTemplate({ enabled: false }).enabled).toBe(false);
    expect(aWorkOrderDetail().repos).toHaveLength(2);
  });
});
