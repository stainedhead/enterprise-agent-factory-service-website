import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import { agentView } from "../../domain/status.js";
import {
  Alert,
  Badge,
  Banner,
  Breadcrumbs,
  DiffView,
  KeyValue,
  LiveRegion,
  PageHeader,
  StatusIndicator,
} from "./index.js";

describe("StatusIndicator (M0-U4)", () => {
  it("renders a dot and a word, never colour alone", () => {
    const { container } = render(<StatusIndicator status={{ phase: "Degraded" }} />);
    expect(screen.getByText("Degraded")).toBeTruthy();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
  it("shows Budget blocked and an unknown phase as raw text", () => {
    render(
      <>
        <StatusIndicator
          status={{ phase: "Ready", conditions: [{ type: "BudgetExhausted", status: "True" }] }}
        />
        <StatusIndicator status={{ phase: "Hibernating" }} />
        <StatusIndicator view={agentView({ paused: true, status: { phase: "Ready" } })} />
      </>,
    );
    expect(screen.getByText("Budget blocked")).toBeTruthy();
    expect(screen.getByText("Hibernating")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
  });
});

describe("Alert, Banner, LiveRegion (M0-U4)", () => {
  it("an error alert shows the request id with a copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(
      <Alert kind="error" title="Could not save" requestId="req_123">
        Try again.
      </Alert>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/req_123/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Copy request id" }));
    expect(writeText).toHaveBeenCalledWith("req_123");
    expect(await screen.findByText("Copied")).toBeTruthy();
    await expectNoA11yViolations(container);
  });
  it("info alerts are status regions; action and dismiss work", async () => {
    const act = vi.fn();
    const dismiss = vi.fn();
    render(
      <Alert kind="info" action={{ label: "Reload", onClick: act }} onDismiss={dismiss}>
        Newer version
      </Alert>,
    );
    expect(screen.getByRole("status")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(act).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  });
  it("Banner and LiveRegion announce politely", async () => {
    const retry = vi.fn();
    render(
      <>
        <Banner action={{ label: "Retry", onClick: retry }}>AFS is not responding</Banner>
        <LiveRegion message="Agent is Ready" />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
    const live = screen.getByText("Agent is Ready");
    expect(live.getAttribute("aria-live")).toBe("polite");
  });
});

describe("page furniture (M0-U7)", () => {
  it("PageHeader, Breadcrumbs, KeyValue and Badge are accessible", async () => {
    const { container } = render(
      <main>
        <Breadcrumbs crumbs={[{ label: "Teams", to: "/teams" }, { label: "Payments" }]} />
        <PageHeader
          title="Payments"
          description="Payment agents"
          infoHref="/info"
          actions={<Badge tone="purple">Ephemeral</Badge>}
        />
        <KeyValue
          items={[
            { label: "Owner", value: "lead@example.com" },
            { label: "Kind", value: <Badge>Unmetered</Badge> },
          ]}
        />
      </main>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Payments");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.getByText("Payments", { selector: "li" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByText("Owner")).toBeTruthy();
    await expectNoA11yViolations(container);
  });
  it("DiffView marks added and removed lines for screen readers", () => {
    render(<DiffView before={"a\nb"} after={"a\nc"} />);
    expect(screen.getByText(/Removed:/)).toBeTruthy();
    expect(screen.getByText(/Added:/)).toBeTruthy();
  });
});
