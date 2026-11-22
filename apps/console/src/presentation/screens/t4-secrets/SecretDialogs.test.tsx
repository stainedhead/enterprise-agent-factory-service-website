import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { agentsServices, fakeAgentsPort } from "../../testing/agents.js";
import { externalSystemsServices, fakeExternalSystemsPort } from "../../testing/externalSystems.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { fakeSecretsPort, secretsServices } from "../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T4 from "./index.js";

const SENTINEL = "s3ntinel-denied-value-9";
const denied = () =>
  new AppError({
    kind: "access-denied",
    message: "denied",
    requestId: "req_denied_7",
    requiredPermission: "secrets:write",
  });

function open(secrets: ReturnType<typeof fakeSecretsPort>) {
  renderScreen(<T4 />, {
    me: TEAM_ADMIN,
    services: {
      ...teamsServices(fakeTeamsPort({ get: vi.fn(async () => aTeam()) })),
      ...agentsServices(fakeAgentsPort()),
      ...secretsServices(secrets),
      ...externalSystemsServices(fakeExternalSystemsPort()),
    },
    path: "/t/team_1/secrets",
    route: "/t/:teamId/secrets",
  });
}

describe("FR-002 a denied secret write is visible in the dialog", () => {
  it("create secret: names the permission and request id, clears the value, stays open", async () => {
    const secrets = fakeSecretsPort({ create: vi.fn(async () => Promise.reject(denied())) });
    open(secrets);
    await screen.findByText("github-bot-key");
    await userEvent.click(screen.getByRole("button", { name: "Create secret" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Name"), "pagerduty-token");
    await userEvent.type(d.getByLabelText("Secret value"), SENTINEL);
    await userEvent.click(d.getByRole("button", { name: "Create secret" }));
    const alert = await d.findByText(/It requires/);
    expect(alert.textContent).toContain("secrets:write");
    expect(d.getByText(/Request id: req_denied_7/)).toBeTruthy();
    expect((d.getByLabelText("Secret value") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(SENTINEL);
  });

  it("rotate secret: names the permission and request id, clears the value, stays open", async () => {
    const secrets = fakeSecretsPort({ rotate: vi.fn(async () => Promise.reject(denied())) });
    open(secrets);
    await userEvent.click(await screen.findByRole("button", { name: "Rotate github-bot-key" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("New secret value"), SENTINEL);
    await userEvent.click(d.getByRole("button", { name: "Rotate" }));
    const alert = await d.findByText(/It requires/);
    expect(alert.textContent).toContain("secrets:write");
    expect(d.getByText(/Request id: req_denied_7/)).toBeTruthy();
    expect((d.getByLabelText("New secret value") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(SENTINEL);
  });
});
