import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import { adminModelsServices, fakeModelsPort, fakePricingPort } from "../../testing/adminModels.js";
import { SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSetting,
  fakeIdpPort,
  fakeSettingsPort,
  settingsServices,
} from "../../testing/settings.js";
import { ALL_PERMS, serviceAdminWith } from "../../testing/teams.js";
import S4 from "./index.js";

function open(me = SERVICE_ADMIN, pricing = fakePricingPort(), access = "all") {
  const models = fakeModelsPort();
  const settings = fakeSettingsPort({
    list: async () => [
      aSetting({ key: "models.service_access", type: "string", value: access, default: "all" }),
    ],
  });
  renderScreen(<S4 />, {
    me,
    services: {
      ...adminModelsServices(models, pricing),
      ...settingsServices(settings, fakeIdpPort()),
    },
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
    await userEvent.click(
      within(screen.getByRole("table", { name: "Models" })).getAllByRole("radio")[0] as HTMLElement,
    );
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

describe("S4 service model access (MOD-1)", () => {
  it("shows the current access, saves a change and shows the equivalent command", async () => {
    const { models } = open();
    const all = (await screen.findByRole("radio", { name: "All models" })) as HTMLInputElement;
    await waitFor(() => expect(all.checked).toBe(true));
    await userEvent.click(screen.getByRole("radio", { name: "Selected models" }));
    expect(screen.getAllByText(/afs admin put-service-model-access/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(models.putServiceAccess).toHaveBeenCalledWith("selected"));
  });
  it("Enable and Disable are offered only while access is Selected", async () => {
    open(SERVICE_ADMIN, fakePricingPort(), "all");
    const off = await screen.findByRole("button", { name: "Disable anthropic.claude-haiku-4" });
    expect(off.getAttribute("aria-disabled")).toBe("true");
  });
  it("in Selected mode a model can be enabled", async () => {
    const { models } = open(SERVICE_ADMIN, fakePricingPort(), "selected");
    const b = await screen.findByRole("button", { name: "Enable meta.llama-3" });
    await waitFor(() => expect(b.getAttribute("aria-disabled")).toBeNull());
    await userEvent.click(b);
    await waitFor(() => expect(models.setEnabled).toHaveBeenCalled());
    expect(models.setEnabled.mock.calls[0]?.[1]).toBe(true);
  });
  it("without admin:models the controls are disabled naming the role", async () => {
    open(serviceAdminWith(ALL_PERMS.filter((p) => p !== "admin:models")));
    const save = await screen.findByRole("button", { name: "Save access" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
  });
});
