import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { DraftStore } from "../../../application/usecases/session/DraftStore.js";
import { draftIds, expectNoDraftLeft, withDrafts } from "../../hooks/useDraft.testing.js";
import { SEC_OP } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  fakeSwarmTemplatesPort,
  fakeTeamDirectoryPort,
  fakeWorkOrdersPort,
  workOrdersServices,
} from "../../testing/workOrders.js";
import { CreateWorkOrderPage } from "./CreateWorkOrderPage.js";

const FORM = "p3-create-work-order";

function open(drafts: DraftStore, port = fakeWorkOrdersPort()) {
  renderScreen(withDrafts(<CreateWorkOrderPage />, drafts), {
    me: SEC_OP,
    services: workOrdersServices(port, fakeTeamDirectoryPort(), fakeSwarmTemplatesPort()),
    path: "/work-orders/new",
    route: "/work-orders/new",
  });
  return port;
}
const fill = async () => {
  const u = userEvent.setup();
  await screen.findByRole("heading", { name: "Create work order" });
  await waitFor(() =>
    expect(within(screen.getByLabelText("Template")).getAllByRole("option")).toHaveLength(2),
  );
  await u.type(screen.getByLabelText("CVE"), "CVE-2026-1234");
  await u.type(screen.getByLabelText("Title"), "OpenSSL RCE");
  await u.selectOptions(screen.getByLabelText("Template"), "swt_1");
  await u.type(screen.getByLabelText("Repository 1"), "github.com/acme/api");
  return u;
};
const submit = () =>
  screen.getAllByRole("button", { name: "Create work order" }).at(-1) as HTMLElement;

describe("P3 create work order drafts (FR-004, D-4)", () => {
  it("restores the fields, including the repository rows, after a remount", async () => {
    const drafts = new DraftStore();
    open(drafts);
    await fill();
    expect(draftIds(drafts)).toEqual([FORM]);
    cleanup();
    open(drafts);
    expect(((await screen.findByLabelText("Title")) as HTMLInputElement).value).toBe("OpenSSL RCE");
    expect((screen.getByLabelText("CVE") as HTMLInputElement).value).toBe("CVE-2026-1234");
    expect((screen.getByLabelText("Repository 1") as HTMLInputElement).value).toBe(
      "github.com/acme/api",
    );
  });

  it("discards the draft when the work order is created", async () => {
    const drafts = new DraftStore();
    const port = open(drafts);
    const u = await fill();
    await u.type(screen.getByLabelText("SLA due"), "2026-11-28T18:00");
    expect(draftIds(drafts)).toEqual([FORM]);
    await u.click(submit());
    await waitFor(() => expect(port.create).toHaveBeenCalledOnce());
    await waitFor(() => expectNoDraftLeft(drafts));
  });

  it("discards the draft on cancel", async () => {
    const drafts = new DraftStore();
    open(drafts);
    await fill();
    expect(draftIds(drafts)).toEqual([FORM]);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectNoDraftLeft(drafts);
  });

  it("keeps the draft when the create is refused", async () => {
    const drafts = new DraftStore();
    const port = open(
      drafts,
      fakeWorkOrdersPort({
        create: vi.fn(async () => {
          throw new AppError({ kind: "unavailable", message: "later" });
        }),
      }),
    );
    const u = await fill();
    await u.type(screen.getByLabelText("SLA due"), "2026-11-28T18:00");
    await u.click(submit());
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(draftIds(drafts)).toEqual([FORM]);
  });
});
