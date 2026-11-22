import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { fakeAuditPort, fakeRevisionsPort, historyServices } from "../../testing/history.js";
import { renderScreen } from "../../testing/screen.js";
import T15 from "./index.js";

function open(
  o: {
    path?: string;
    me?: Me;
    audit?: ReturnType<typeof fakeAuditPort>;
    revisions?: ReturnType<typeof fakeRevisionsPort>;
  } = {},
) {
  const audit = o.audit ?? fakeAuditPort();
  const revisions = o.revisions ?? fakeRevisionsPort();
  renderScreen(<T15 />, {
    me: o.me ?? TEAM_ADMIN,
    services: historyServices(audit, revisions),
    path: o.path ?? "/t/team_1/history/audit",
    route: "/t/:teamId/history/*",
  });
  return { audit, revisions };
}

afterEach(() => vi.restoreAllMocks());

describe("T15 activity and audit (M1-H1)", () => {
  it("lists actor, action, resource, outcome and request id", async () => {
    open();
    const row = (await screen.findByText("agents.create")).closest("tr") as HTMLElement;
    expect(within(row).getByText("usr_a")).toBeTruthy();
    expect(within(row).getByText("agent agt_1")).toBeTruthy();
    expect(within(row).getByText("allowed")).toBeTruthy();
    expect(within(row).getByText("req_abc")).toBeTruthy();
  });

  it("sends filters as query parameters and starts again from the first page", async () => {
    const { audit } = open();
    await screen.findByText("agents.create");
    await userEvent.selectOptions(screen.getByLabelText("Outcome"), "denied");
    await waitFor(() =>
      expect(audit.list).toHaveBeenLastCalledWith(
        "team_1",
        { outcome: "denied" },
        expect.objectContaining({ maxResults: 25 }),
      ),
    );
    await userEvent.type(screen.getByLabelText("Action"), "teams");
    await waitFor(() =>
      expect(audit.list).toHaveBeenLastCalledWith(
        "team_1",
        { outcome: "denied", action: "teams" },
        expect.anything(),
      ),
    );
  });

  it("reads the filter from the URL", async () => {
    const { audit } = open({ path: "/t/team_1/history/audit?outcome=failed&actorId=usr_z" });
    await screen.findByText("agents.create");
    expect(audit.list).toHaveBeenCalledWith(
      "team_1",
      { actorId: "usr_z", outcome: "failed" },
      expect.anything(),
    );
    expect((screen.getByLabelText("Outcome") as HTMLSelectElement).value).toBe("failed");
  });

  it("loads the first page once, not twice", async () => {
    const { audit } = open();
    await screen.findByText("agents.create");
    expect(audit.list).toHaveBeenCalledTimes(1);
  });

  it("downloads the CSV for the current filter", async () => {
    const create = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const { audit } = open({ path: "/t/team_1/history/audit?outcome=denied" });
    await screen.findByText("agents.create");
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() =>
      expect(audit.csv).toHaveBeenCalledWith("team_1", { outcome: "denied" }, undefined),
    );
    await waitFor(() => expect(create).toHaveBeenCalled());
  });

  it("shows the period error for an end before the start", async () => {
    open({ path: "/t/team_1/history/audit?from=2026-11-02T00:00:00Z&to=2026-11-01T23:59:59Z" });
    expect(await screen.findByText("The end must not be before the start")).toBeTruthy();
  });

  it("shows a load error in the table", async () => {
    const audit = fakeAuditPort({
      list: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "bad filter" });
      }),
    });
    open({ audit });
    expect(await screen.findByText("bad filter")).toBeTruthy();
  });

  it("denied: without audit:read the audit tab is not found and nothing is read", async () => {
    const me: Me = {
      ...TEAM_ADMIN,
      teams: [
        {
          ...(TEAM_ADMIN.teams[0] as Me["teams"][number]),
          permissions: ["revisions:read", "teams:read"],
        },
      ],
    };
    const { audit } = open({ me });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(audit.list).not.toHaveBeenCalled();
  });

  it("a viewer sees both tabs read-only (they only read)", async () => {
    open({ me: VIEWER });
    expect(await screen.findByRole("tab", { name: "Config revisions" })).toBeTruthy();
  });
});

describe("T15 config revisions (M1-H2)", () => {
  const rev = { path: "/t/team_1/history/revisions" };
  const check = async (n: number, resource = "team team_1") => {
    const row = screen
      .getAllByText(resource)
      .map((e) => e.closest("tr") as HTMLElement)
      .find((r) => within(r).queryByText(String(n)));
    await userEvent.click(within(row as HTMLElement).getByRole("checkbox"));
  };

  it("lists revisions with resource, author and time", async () => {
    open(rev);
    expect((await screen.findAllByText("team team_1")).length).toBe(2);
    expect(screen.getByText("team team_2")).toBeTruthy();
    expect(screen.getAllByText("usr_a").length).toBeGreaterThan(0);
  });

  it("selecting two revisions of one resource shows a diff, older to newer", async () => {
    const { revisions } = open(rev);
    await screen.findAllByText("team team_1");
    await check(3);
    await check(2);
    expect(await screen.findByText(/Revision 2 to revision 3 of team team_1/)).toBeTruthy();
    expect(revisions.get).toHaveBeenCalledWith("team_1", 3, expect.anything());
    expect(revisions.get).toHaveBeenCalledWith("team_1", 2, expect.anything());
    expect(screen.getByText(/Removed:/)).toBeTruthy();
    expect(screen.getByText(/Added:/)).toBeTruthy();
  });

  it("refuses to compare revisions of different resources", async () => {
    open(rev);
    await screen.findAllByText("team team_1");
    await check(3);
    await check(1, "team team_2");
    expect(await screen.findByText(/same resource/)).toBeTruthy();
  });

  it("a third selection replaces the oldest, so at most two are compared", async () => {
    open(rev);
    await screen.findAllByText("team team_1");
    await check(3);
    await check(2);
    await check(1, "team team_2");
    const boxes = screen.getAllByRole("checkbox").filter((b) => (b as HTMLInputElement).checked);
    expect(boxes.length).toBe(2);
  });

  it("filters by resource on the server", async () => {
    const { revisions } = open(rev);
    await screen.findAllByText("team team_1");
    await userEvent.type(screen.getByLabelText("Resource kind"), "team");
    await waitFor(() =>
      expect(revisions.list).toHaveBeenLastCalledWith(
        "team_1",
        { resourceKind: "team", resourceId: undefined },
        expect.anything(),
      ),
    );
  });
});
