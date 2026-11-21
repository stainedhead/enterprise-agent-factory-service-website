import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import { ActionsMenu, Button, Tooltip } from "./index.js";

describe("Button (M0-U2)", () => {
  it("click calls the handler", async () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("a disabledReason disables, stays focusable and explains itself", async () => {
    const fn = vi.fn();
    const { container } = render(
      <Button variant="primary" disabledReason="Requires team-admin" onClick={fn}>
        Create
      </Button>,
    );
    const b = screen.getByRole("button", { name: "Create" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await userEvent.tab();
    expect(document.activeElement).toBe(b);
    const tip = await screen.findByRole("tooltip");
    await userEvent.keyboard("{Enter}");
    expect(fn).not.toHaveBeenCalled();
    expect(tip.textContent).toBe("Requires team-admin");
    expect(b.getAttribute("aria-describedby")).toBe(tip.id);
    await expectNoA11yViolations(container);
  });
  it("Escape hides the tooltip", async () => {
    render(<Button disabledReason="Requires service admin">x</Button>);
    await userEvent.tab();
    await screen.findByRole("tooltip");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("Tooltip without text renders only its child", () => {
    render(
      <Tooltip text={undefined}>
        <span>child</span>
      </Tooltip>,
    );
    expect(screen.getByText("child")).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("ActionsMenu (M0-U2, U9)", () => {
  const setup = () => {
    const a = vi.fn();
    const b = vi.fn();
    const utils = render(
      <ActionsMenu
        actions={[
          { id: "a", label: "Suspend", onSelect: a },
          { id: "b", label: "Delete", onSelect: b, disabledReason: "Requires service admin" },
          { id: "c", label: "Resume", onSelect: vi.fn() },
        ]}
      />,
    );
    return { a, b, ...utils };
  };
  it("opens with the first item focused and moves with arrow keys, Home and End", async () => {
    setup();
    const btn = screen.getByRole("button", { name: /Actions/ });
    await userEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const items = screen.getAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(items[2]);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items[2]);
    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(items[0]);
  });
  it("Escape closes and returns focus to the button", async () => {
    setup();
    const btn = screen.getByRole("button", { name: /Actions/ });
    await userEvent.click(btn);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
  it("selects an enabled item and ignores a disabled one", async () => {
    const { a, b } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(b).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "Suspend" }));
    expect(a).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("has no serious axe violations when open", async () => {
    const { container } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    await act(async () => {});
    await expectNoA11yViolations(container);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
  });
});
