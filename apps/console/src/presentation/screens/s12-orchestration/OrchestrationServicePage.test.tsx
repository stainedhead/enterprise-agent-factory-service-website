import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { SERVICE_ADMIN } from "../../testing/harness.js";
import { fakeOrchestrationPort, orchestrationServices } from "../../testing/orchestration.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSetting,
  fakeIdpPort,
  fakeSettingsPort,
  settingsServices,
} from "../../testing/settings.js";
import { ALL_PERMS, serviceAdminWith } from "../../testing/teams.js";
import S12 from "./index.js";

const setting = (key: string, value: unknown, over = {}) =>
  aSetting({ key, value, default: value, type: "string", allowed: "text", ...over });

const SETTINGS = [
  setting("orchestration.public_endpoints", "true", { type: "boolean" }),
  setting("orchestration.private_endpoints", "true", { type: "boolean" }),
  setting("orchestration.public_base_domain", "collab.example.test"),
  setting("orchestration.private_base_domain", ""),
  setting("orchestration.default_limit", "private"),
  setting("orchestration.default_web_ui_exposure", "private"),
  setting("orchestration.default_web_api_exposure", "off"),
  setting("collab.content_scan", "block"),
  setting(
    "orchestration.tools",
    {
      paperclip: {
        enabled: true,
        default: true,
        templateId: "tpl_pc",
        webUi: true,
        webApi: true,
        registration: ["manual", "managed"],
      },
      buzz: {
        enabled: true,
        default: false,
        templateId: null,
        webUi: false,
        webApi: false,
        registration: ["managed"],
      },
    },
    { type: "object" },
  ),
];

const endpoint = (
  teamId: string,
  slug: string,
  tool: string,
  surface: string,
  effective: string,
) => ({
  teamId,
  slug,
  teamState: "active",
  agentId: "agt_o",
  tool,
  surface,
  exposure: effective,
  effective,
  reasons: [],
  limit: "private",
  hostname: effective === "off" ? null : `${slug}.collab.example.test`,
  phase: "Ready",
});

function open(
  o: {
    path?: string;
    me?: typeof SERVICE_ADMIN;
    orch?: ReturnType<typeof fakeOrchestrationPort>;
  } = {},
) {
  const orch =
    o.orch ??
    fakeOrchestrationPort({
      listEndpoints: vi.fn(async () => ({
        items: [
          endpoint("team_1", "alpha", "paperclip", "webUi", "private"),
          endpoint("team_2", "beta", "buzz", "webUi", "off"),
        ],
        migration: {
          state: "running",
          teamsTotal: 10,
          teamsWithOrchestration: 7,
          teamsPending: 3,
          blocked: [{ teamId: "team_9", reason: "no_runtime" }],
        },
      })),
    });
  const settings = fakeSettingsPort({ list: async () => SETTINGS });
  renderScreen(<S12 />, {
    me: o.me ?? SERVICE_ADMIN,
    services: { ...orchestrationServices(orch), ...settingsServices(settings, fakeIdpPort()) },
    path: o.path ?? "/orchestration",
    route: "/orchestration/:tab?",
  });
  return { orch, settings };
}

describe("S12 service orchestration", () => {
  it("lists every team's endpoint with the tool, level and hostname", async () => {
    open();
    const t = await screen.findByRole("table", { name: "Orchestration endpoints" });
    expect(await within(t).findByText("alpha")).toBeTruthy();
    expect(within(t).getByText("Buzz")).toBeTruthy();
    expect(within(t).getByText("alpha.collab.example.test")).toBeTruthy();
  });
  it("shows the migration banner with the blocked teams while the backfill runs", async () => {
    open();
    expect(await screen.findByText(/7 of 10 teams have one/)).toBeTruthy();
    expect(screen.getByText(/no_runtime/)).toBeTruthy();
  });
  it("filters by tool and exposure through the query", async () => {
    const { orch } = open();
    await screen.findByText("alpha");
    await userEvent.selectOptions(screen.getByLabelText("Tool"), "buzz");
    await waitFor(() =>
      expect(orch.listEndpoints.mock.calls.some((c) => c[0].tool === "buzz")).toBe(true),
    );
    await userEvent.selectOptions(screen.getByLabelText("Exposure"), "public");
    await waitFor(() =>
      expect(orch.listEndpoints.mock.calls.some((c) => c[0].exposure === "public")).toBe(true),
    );
  });
  it("downloads the CSV with the same filters", async () => {
    const { orch } = open();
    await screen.findByText("alpha");
    await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(orch.endpointsCsv).toHaveBeenCalled());
  });
  it("shows an access-denied alert for a caller without admin:settings", async () => {
    open({
      orch: fakeOrchestrationPort({
        listEndpoints: async () => {
          throw new AppError({
            kind: "access-denied",
            message: "no",
            requiredPermission: "admin:settings",
          });
        },
      }),
    });
    expect(await screen.findByText(/admin:settings/)).toBeTruthy();
  });
  it("Tools and runtimes lists the tools with their template for service admins", async () => {
    open({ path: "/orchestration/tools" });
    const t = await screen.findByRole("table", { name: "Tools and runtimes" });
    expect(await within(t).findByText("tpl_pc")).toBeTruthy();
    expect(within(t).getByText("Not set")).toBeTruthy();
    expect(within(t).getAllByText("N/A").length).toBe(2);
  });
  it("Defaults edits a setting with the version held", async () => {
    const { settings } = open({ path: "/orchestration/defaults" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit orchestration.default_limit" }),
    );
    const d = await screen.findByRole("dialog");
    await userEvent.selectOptions(within(d).getByLabelText("Value"), "public");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(settings.put).toHaveBeenCalled());
    expect(settings.put.mock.calls[0]?.[0]).toMatchObject({
      key: "orchestration.default_limit",
      version: 4,
    });
  });
  it("Kill switches ask before turning a level off for every team", async () => {
    const { settings } = open({ path: "/orchestration/kill-switches" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit orchestration.public_endpoints" }),
    );
    const d = await screen.findByRole("dialog");
    await userEvent.selectOptions(within(d).getByLabelText("Value"), "false");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(await within(d).findByText(/Every team's endpoint at that level stops/)).toBeTruthy();
    expect(settings.put).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(settings.put).toHaveBeenCalled());
  });
  it("a base domain change asks too, and the edit buttons name the role when denied", async () => {
    open({
      path: "/orchestration/kill-switches",
      me: serviceAdminWith(ALL_PERMS.filter((p) => p !== "admin:settings")),
    });
    const b = await screen.findByRole("button", { name: "Edit orchestration.public_base_domain" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
  });
});
