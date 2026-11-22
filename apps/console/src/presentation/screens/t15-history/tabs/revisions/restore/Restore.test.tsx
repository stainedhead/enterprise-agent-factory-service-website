import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../../../application/errors.js";
import type { Me } from "../../../../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../../../../testing/harness.js";
import {
  fakeAuditPort,
  fakeRevisionsPort,
  historyServices,
} from "../../../../../testing/history.js";
import { renderScreen } from "../../../../../testing/screen.js";
import T15 from "../../../index.js";

function open(me: Me = TEAM_ADMIN, revisions = fakeRevisionsPort()) {
  renderScreen(<T15 />, {
    me,
    services: historyServices(fakeAuditPort(), revisions),
    path: "/t/team_1/history/revisions",
    route: "/t/:teamId/history/*",
  });
  return revisions;
}
const pick = async (n: number) => {
  const row = (await screen.findAllByText("team team_1"))
    .map((e) => e.closest("tr") as HTMLElement)
    .find((r) => within(r).queryByText(String(n)));
  await userEvent.click(within(row as HTMLElement).getByRole("checkbox"));
};
const restoreBtn = () => screen.getByRole("button", { name: "Restore the selected revision" });

describe("T15 restore (M4-S3)", () => {
  it("shows the plan with what is skipped first, then applies after confirming", async () => {
    const revisions = open();
    await screen.findAllByText("team team_1");
    expect(restoreBtn().getAttribute("aria-disabled")).toBe("true");
    await pick(2);
    await userEvent.click(restoreBtn());
    const d = await screen.findByRole("dialog", { name: "Restore revision 2" });
    expect(await within(d).findByText(/displayName: Alpha 3 → Alpha 1/)).toBeTruthy();
    expect(within(d).getByText("The secret no longer exists", { exact: false })).toBeTruthy();
    expect(revisions.restore).toHaveBeenCalledWith("team_1", 2, true);
    expect(revisions.restore).toHaveBeenCalledTimes(1);
    await userEvent.click(within(d).getByRole("button", { name: "Apply restore" }));
    const c = await screen.findByRole("dialog", { name: "Apply restore of revision 2" });
    expect(revisions.restore).toHaveBeenCalledTimes(1);
    await userEvent.click(within(c).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(revisions.restore).toHaveBeenLastCalledWith("team_1", 2, false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("offers nothing to apply when the resource already matches", async () => {
    open(
      TEAM_ADMIN,
      fakeRevisionsPort({
        restore: async (_t, n, dryRun) => ({ revision: n, dryRun, changes: [], skipped: [] }),
      }),
    );
    await pick(2);
    await userEvent.click(restoreBtn());
    expect(await screen.findByText(/already matches/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Apply restore" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("a viewer can view and diff but Restore is disabled naming the role", async () => {
    const revisions = open(VIEWER);
    await pick(3);
    await pick(2);
    expect(await screen.findByText(/Revision 2 to revision 3/)).toBeTruthy();
    expect(restoreBtn().getAttribute("aria-disabled")).toBe("true");
    await userEvent.hover(restoreBtn());
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
    expect(revisions.restore).not.toHaveBeenCalled();
  });
  it("shows the API's access denied when a restore is forced", async () => {
    const revisions = fakeRevisionsPort();
    revisions.restore.mockRejectedValue(
      new AppError({
        kind: "access-denied",
        message: "Requires revisions:restore",
        requestId: "r",
      }),
    );
    open(SERVICE_ADMIN, revisions);
    await pick(2);
    await userEvent.click(restoreBtn());
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
