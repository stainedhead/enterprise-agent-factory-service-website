import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import {
  CliPreview,
  clearAllSecretInputs,
  FormField,
  fieldMessage,
  SecretInput,
  type SecretInputHandle,
  Tabs,
  Wizard,
} from "./index.js";

describe("FormField (M0-U6)", () => {
  it("labels the control and ties hint and error to it", async () => {
    const { container } = render(
      <FormField label="Name" hint="Lower-case" error="Already taken">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText("Name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const desc = input.getAttribute("aria-describedby") ?? "";
    expect(desc.split(" ")).toHaveLength(2);
    expect(screen.getByRole("alert").textContent).toBe("Already taken");
    await expectNoA11yViolations(container);
  });
  it("without hint or error adds no description", () => {
    render(
      <FormField label="Owner">
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText("Owner").getAttribute("aria-describedby")).toBeNull();
  });
  it("reads an error from ValidationError details.fields[]", () => {
    const fields = [{ field: "displayName", message: "too long" }];
    expect(fieldMessage(fields, "displayName")).toBe("too long");
    expect(fieldMessage(fields, "other")).toBeUndefined();
    expect(fieldMessage(undefined, "x")).toBeUndefined();
  });
});

describe("Wizard (M0-U6)", () => {
  it("gates Next on validity and ends with a review step", async () => {
    const submit = vi.fn();
    let valid = false;
    const view = (v: boolean) => (
      <Wizard
        steps={[
          { id: "a", title: "Basics", valid: v, content: <p>basics</p> },
          { id: "b", title: "Budget", valid: true, content: <p>budget</p> },
        ]}
        review={<p>review everything</p>}
        onSubmit={submit}
        onCancel={vi.fn()}
      />
    );
    const { rerender, container } = render(view(valid));
    const next = screen.getByRole("button", { name: "Next" });
    await userEvent.click(next);
    expect(screen.getByText("basics")).toBeTruthy();
    valid = true;
    rerender(view(valid));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("budget")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("review everything")).toBeTruthy();
    expect(screen.getByText(/3\. Review/).getAttribute("aria-current")).toBe("step");
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("budget")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(submit).toHaveBeenCalled();
  });
});

describe("Tabs (M0-U7, U9)", () => {
  const tabs = [
    { id: "one", label: "One", content: <p>first</p> },
    { id: "two", label: "Two", content: <p>second</p> },
    { id: "three", label: "Three", content: <p>third</p> },
  ];
  it("arrow keys move and activate, Home and End jump", async () => {
    const onChange = vi.fn();
    const { container } = render(<Tabs label="Sections" tabs={tabs} onChange={onChange} />);
    const t = screen.getAllByRole("tab");
    t[0]?.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(t[1]?.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("second")).toBeTruthy();
    await userEvent.keyboard("{End}");
    expect(screen.getByText("third")).toBeTruthy();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("first")).toBeTruthy();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("third")).toBeTruthy();
    await userEvent.keyboard("{Home}");
    expect(screen.getByText("first")).toBeTruthy();
    expect(onChange).toHaveBeenCalledWith("three");
    expect(t[0]?.getAttribute("tabindex")).toBe("0");
    expect(t[1]?.getAttribute("tabindex")).toBe("-1");
    await expectNoA11yViolations(container);
  });
  it("is controllable", () => {
    render(<Tabs label="Sections" tabs={tabs} activeId="two" />);
    expect(screen.getByText("second")).toBeTruthy();
  });
});

describe("SecretInput (M0-U8)", () => {
  it("is masked, uncontrolled, read by ref and cleared on demand", async () => {
    const ref = createRef<SecretInputHandle>();
    const { container } = render(
      <FormField label="Secret value">
        <SecretInput ref={ref} />
      </FormField>,
    );
    const input = screen.getByLabelText("Secret value") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    await userEvent.type(input, "hunter2-SENTINEL");
    expect(ref.current?.read()).toBe("hunter2-SENTINEL");
    expect(container.innerHTML).not.toContain("hunter2-SENTINEL");
    ref.current?.clear();
    expect(ref.current?.read()).toBe("");
  });
  it("the registry clears every mounted secret input and forgets unmounted ones", async () => {
    const a = createRef<SecretInputHandle>();
    const b = createRef<SecretInputHandle>();
    const { unmount } = render(
      <>
        <SecretInput ref={a} aria-describedby="x" />
        <SecretInput ref={b} />
      </>,
    );
    const inputs = document.querySelectorAll<HTMLInputElement>("input[type=password]");
    for (const i of inputs) await userEvent.type(i, "s3cret");
    expect(clearAllSecretInputs()).toBe(2);
    expect(a.current?.read()).toBe("");
    expect(b.current?.read()).toBe("");
    act(() => unmount());
    expect(clearAllSecretInputs()).toBe(0);
  });
});

describe("CliPreview (M0-U8)", () => {
  it("renders the command and copies it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(
      <CliPreview
        command={{
          service: "teams",
          operation: "create-team",
          args: [
            ["display-name", "Pay ments"],
            ["slug", "pay"],
            ["thresholds", ["50", "80"]],
            ["owner", undefined],
          ],
        }}
      />,
    );
    const text = "afs teams create-team --display-name 'Pay ments' --slug pay --thresholds 50 80";
    expect(screen.getByText(text)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Copy command" }));
    expect(writeText).toHaveBeenCalledWith(text);
    await expectNoA11yViolations(container);
  });
});
