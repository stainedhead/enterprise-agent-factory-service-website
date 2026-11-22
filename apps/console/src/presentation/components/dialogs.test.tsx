import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import {
  Button,
  ConfirmDialog,
  Modal,
  OneTimeSecretDialog,
  type OneTimeSecretHandle,
  TypeToConfirm,
} from "./index.js";

describe("Modal (M0-U5)", () => {
  it("focuses in, traps Tab, closes on Escape and restores focus", async () => {
    const close = vi.fn();
    const { rerender } = render(<Button>Open</Button>);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    rerender(
      <>
        <Button>Open</Button>
        <Modal title="Edit" onClose={close} actions={<Button>OK</Button>}>
          <input aria-label="name" />
        </Modal>
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: "Edit" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("name"));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "OK" }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("name"));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "OK" }));
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });
});

describe("ConfirmDialog and TypeToConfirm (M0-U5)", () => {
  it("an optional required note gates the confirm button", async () => {
    const ok = vi.fn();
    const { container } = render(
      <ConfirmDialog
        title="Suspend team"
        withNote={{ label: "Reason", required: true }}
        confirmLabel="Suspend"
        onConfirm={ok}
        onCancel={vi.fn()}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Suspend" });
    await userEvent.click(confirm);
    expect(ok).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Reason"), " over budget ");
    await userEvent.click(confirm);
    expect(ok).toHaveBeenCalledWith("over budget");
    await expectNoA11yViolations(container);
  });
  it("without a note it confirms with undefined; Cancel cancels", async () => {
    const ok = vi.fn();
    const no = vi.fn();
    render(<ConfirmDialog title="Resume" onConfirm={ok} onCancel={no} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(ok).toHaveBeenCalledWith(undefined);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(no).toHaveBeenCalled();
  });
  it("TypeToConfirm enables only on the exact name", async () => {
    const ok = vi.fn();
    render(
      <TypeToConfirm title="Delete team" expected="payments" onConfirm={ok} onCancel={vi.fn()} />,
    );
    const del = screen.getByRole("button", { name: "Delete" });
    const input = screen.getByLabelText(/Type/);
    await userEvent.type(input, "payment");
    await userEvent.click(del);
    expect(ok).not.toHaveBeenCalled();
    await userEvent.type(input, "s");
    await userEvent.click(del);
    expect(ok).toHaveBeenCalled();
  });
});

describe("OneTimeSecretDialog (M0-U5)", () => {
  it("shows the value once with a warning, copies it, and clears it on close", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const ref = createRef<OneTimeSecretHandle>();
    const closed = vi.fn();
    const { container } = render(
      <OneTimeSecretDialog
        ref={ref}
        title="API key created"
        label="secret key"
        onClosed={closed}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    await import("@testing-library/react").then(({ act }) =>
      act(async () => ref.current?.show("afsk_SENTINEL")),
    );
    expect(screen.getByRole("alert").textContent).toContain("only time");
    const out = screen.getByLabelText("secret key");
    expect(out.textContent).toBe("afsk_SENTINEL");
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("afsk_SENTINEL");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(closed).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.textContent).not.toContain("afsk_SENTINEL");
  });
});
