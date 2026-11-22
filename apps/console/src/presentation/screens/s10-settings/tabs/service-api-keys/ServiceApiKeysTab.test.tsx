import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../../application/errors.js";
import {
  adminApiKeysServices,
  fakeAdminApiKeysPort,
  fakeOperatorsPort,
} from "../../../../testing/adminApiKeys.js";
import { renderScreen } from "../../../../testing/screen.js";
import { ALL_PERMS, serviceAdminWith } from "../../../../testing/teams.js";
import S10 from "../../index.js";

describe("FR-002 a denied create service API key is visible in the dialog", () => {
  it("names the permission and request id, shows no key, and stays open", async () => {
    const keys = fakeAdminApiKeysPort({
      create: vi.fn(async () =>
        Promise.reject(
          new AppError({
            kind: "access-denied",
            message: "denied",
            requestId: "req_svc_403",
            requiredPermission: "admin:settings",
          }),
        ),
      ),
    });
    renderScreen(<S10 />, {
      me: serviceAdminWith(ALL_PERMS),
      services: adminApiKeysServices(keys, fakeOperatorsPort()),
      path: "/settings/service-api-keys",
      route: "/settings/:section",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Create service API key" }));
    const d = within(await screen.findByRole("dialog"));
    await userEvent.type(d.getByLabelText("Name"), "denied");
    await userEvent.click(d.getByRole("button", { name: "Create key" }));
    expect((await d.findByText(/It requires/)).textContent).toContain("admin:settings");
    expect(d.getByText(/Request id: req_svc_403/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
