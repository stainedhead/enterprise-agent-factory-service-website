import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import { adminModelsServices, fakeModelsPort, fakePricingPort } from "../../testing/adminModels.js";
import { SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import S4 from "./index.js";

function open(me = SERVICE_ADMIN, pricing = fakePricingPort()) {
  const models = fakeModelsPort();
  renderScreen(<S4 />, {
    me,
    services: adminModelsServices(models, pricing),
    path: "/models",
    route: "/models",
  });
  return { models, pricing };
}

describe("S4 models and pricing (M3-P1)", () => {
  it("lists models with the price in effect, and proposals beside the old price", async () => {
    open();
    const row = (await screen.findByText("meta.llama-3")).closest("tr");
    expect(within(row as HTMLElement).getByText("Disabled")).toBeTruthy();
    expect(await screen.findByText("1.00 → 0.80")).toBeTruthy();
    expect(screen.getByText("5.00 → 4.00")).toBeTruthy();
    expect(screen.getByText("0.08 / 1.00")).toBeTruthy();
  });
  it("approving asks for confirmation with an optional note, then refreshes", async () => {
    const { pricing } = open();
    await userEvent.click(
      await screen.findByRole("button", { name: "Approve anthropic.claude-haiku-4" }),
    );
    const d = await screen.findByRole("dialog");
    expect(pricing.approve).not.toHaveBeenCalled();
    await userEvent.type(within(d).getByLabelText("Note (optional)"), "checked");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(pricing.approve).toHaveBeenCalledWith("prop_1", "checked"));
    await waitFor(() => expect(pricing.proposals.mock.calls.length).toBeGreaterThan(1));
  });
  it("rejecting needs no note", async () => {
    const { pricing } = open();
    await userEvent.click(
      await screen.findByRole("button", { name: "Reject anthropic.claude-haiku-4" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Reject" }),
    );
    await waitFor(() => expect(pricing.reject).toHaveBeenCalledWith("prop_1", undefined));
  });
  it("selecting a model shows its price history", async () => {
    open();
    await screen.findByText("meta.llama-3");
    await userEvent.click(screen.getAllByRole("radio")[0] as HTMLElement);
    expect(await screen.findByText(/price history/)).toBeTruthy();
    expect(await screen.findByText("aws_price_list")).toBeTruthy();
    expect(screen.getAllByText("priya.raman").length).toBe(2);
  });
  it("shows the API's refusal and leaves the row in place", async () => {
    const pricing = fakePricingPort({
      approve: async () => {
        throw new AppError({ kind: "conflict", message: "Proposal already decided" });
      },
    });
    open(SERVICE_ADMIN, pricing);
    await userEvent.click(
      await screen.findByRole("button", { name: "Approve anthropic.claude-haiku-4" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }),
    );
    expect(await screen.findByText("Proposal already decided")).toBeTruthy();
  });
  it("is not found for a team admin", () => {
    open(TEAM_ADMIN);
    expect(screen.queryByText("Model catalog & pricing")).toBeNull();
  });
});
