import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { agentsServices, fakeAgentsPort } from "../../testing/agents.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { configServices, fakeConfigPort } from "../../testing/secrets.js";
import T7 from "./index.js";

function open(o: { me?: Me; config?: ReturnType<typeof fakeConfigPort> } = {}) {
  const config = o.config ?? fakeConfigPort();
  const view = renderScreen(<T7 />, {
    me: o.me ?? TEAM_ADMIN,
    services: { ...agentsServices(fakeAgentsPort()), ...configServices(config) },
    path: "/t/team_1/config",
    route: "/t/:teamId/config",
  });
  return { config, ...view };
}
const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("T7 tables (M2-V1)", () => {
  it("shows namespace values with the agents using them, and the agent's source and effective value", async () => {
    open();
    const row = (await screen.findByText("LOG_LEVEL", { selector: "code" })).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("info")).toBeTruthy();
    expect(await screen.findByText("Agent value")).toBeTruthy();
    expect(screen.getAllByText("Namespace").length).toBeGreaterThan(0);
  });
});

describe("T7 writes (M2-V2, V3)", () => {
  it("refuses a credential-like name with a link to Secrets", async () => {
    const { config } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add value" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "API_TOKEN");
    await userEvent.type(within(d).getByLabelText("Value"), "x");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(await within(d).findByText(/looks like a credential/)).toBeTruthy();
    expect(within(d).getByRole("link", { name: "Go to Secrets" })).toBeTruthy();
    expect(config.putNamespace).not.toHaveBeenCalled();
  });
  it("saves a new value", async () => {
    const { config } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add value" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "REGION");
    await userEvent.type(within(d).getByLabelText("Value"), "eu");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(config.putNamespace).toHaveBeenCalled());
  });
  it("editing a value agents use warns which restart", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit LOG_LEVEL" }));
    expect(await screen.findByText(/Saving restarts the agents/)).toBeTruthy();
  });
  it("a refused delete lists the agents that use the value", async () => {
    const config = fakeConfigPort({
      deleteNamespace: vi.fn(async () => {
        throw new AppError({ kind: "conflict", message: "in use" });
      }),
    });
    open({ config });
    await userEvent.click(await screen.findByRole("button", { name: "Delete LOG_LEVEL" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/is used by agents/)).toBeTruthy();
    expect(within(alert).getByRole("link")).toBeTruthy();
  });
  it("deletes an unused value", async () => {
    const { config } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Delete GITHUB_ORG" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(config.deleteNamespace).toHaveBeenCalled());
  });
});

describe("T7 viewers (M2-V4)", () => {
  it("disables every action with the required role", async () => {
    const { config } = open({ me: VIEWER });
    for (const n of ["Add value", "Edit LOG_LEVEL", "Delete LOG_LEVEL"])
      expect(disabled(await screen.findByRole("button", { name: n }))).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Add value" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(config.putNamespace).not.toHaveBeenCalled();
  });
});
