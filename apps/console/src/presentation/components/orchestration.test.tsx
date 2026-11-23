import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ModelsSpec } from "../../domain/modelAccess.js";
import { ExposureControl } from "./ExposureControl.js";
import { ModelsControl } from "./ModelsControl.js";
import { OrchestrationCard, OrchestrationMark } from "./OrchestrationMark.js";

describe("ExposureControl", () => {
  const setup = (over: Partial<Parameters<typeof ExposureControl>[0]> = {}) => {
    const onChange = vi.fn();
    render(
      <ExposureControl
        label="Web UI"
        value="private"
        limit="private"
        supported
        tool="paperclip"
        onChange={onChange}
        {...over}
      />,
    );
    return onChange;
  };
  it("is a radio group of Off, Private and Public with the value checked", () => {
    setup();
    const g = screen.getByRole("radiogroup", { name: "Web UI" });
    expect(
      within(g)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["off", "private", "public"]);
    expect((within(g).getByRole("radio", { name: "Private" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });
  it("an option above the limit stays visible, is aria-disabled with its reason, and does not change", async () => {
    const onChange = setup();
    const pub = screen.getByRole("radio", { name: "Public" });
    expect(pub.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(pub.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toMatch(/Above this team's limit/);
    await userEvent.click(pub);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("a surface the tool lacks disables Private and Public with the N/A reason", () => {
    setup({ supported: false, tool: "buzz", value: "off" });
    for (const n of ["Private", "Public"]) {
      const r = screen.getByRole("radio", { name: n });
      expect(r.getAttribute("aria-disabled")).toBe("true");
      expect(
        document.getElementById(r.getAttribute("aria-describedby") ?? "")?.textContent,
      ).toMatch(/N\/A for Buzz/);
    }
    expect(screen.getByRole("radio", { name: "Off" }).getAttribute("aria-disabled")).toBeNull();
  });
  it("calls onChange for an allowed option; a whole-control reason blocks everything", async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onChange).toHaveBeenCalledWith("off");
  });
  it("a blocked control names the role for every option", async () => {
    const onChange = setup({ disabledReason: "Requires team-admin" });
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Off" }).getAttribute("aria-disabled")).toBe("true");
  });
});

const ALLOWED = [
  { id: "a", displayName: "Alpha" },
  { id: "b", displayName: "Beta" },
  { id: "c", displayName: "Gamma" },
];
function Harness({ initial, disabledReason }: { initial: ModelsSpec; disabledReason?: string }) {
  const [v, setV] = useState(initial);
  return (
    <ModelsControl value={v} allowed={ALLOWED} onChange={setV} disabledReason={disabledReason} />
  );
}
describe("ModelsControl", () => {
  const allowed = [
    { id: "a", displayName: "Alpha" },
    { id: "b", displayName: "Beta" },
    { id: "c", displayName: "Gamma" },
  ];
  it("All shows the count and a default model from the allowed list", () => {
    render(<Harness initial={{ access: "all", modelIds: [], defaultModelId: "a" }} />);
    expect(screen.getByText("All team models (3)")).toBeTruthy();
    expect((screen.getByLabelText("Default model") as HTMLSelectElement).value).toBe("a");
  });
  it("Selected adds and removes chips and keeps the default valid", async () => {
    render(<Harness initial={{ access: "selected", modelIds: ["a", "b"], defaultModelId: "a" }} />);
    expect(screen.getByText("Selected, 2 of 3 team models")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Remove Alpha" }));
    expect((screen.getByLabelText("Default model") as HTMLSelectElement).value).toBe("b");
    await userEvent.click(screen.getByRole("checkbox", { name: "Gamma" }));
    expect(screen.getByText("Selected, 2 of 3 team models")).toBeTruthy();
  });
  it("a stored model the level above no longer allows is struck through with the reason", () => {
    render(
      <ModelsControl
        value={{ access: "selected", modelIds: ["a", "gone"], defaultModelId: "a" }}
        allowed={allowed}
        onChange={() => {}}
        dropReasonOf={() => "Not allowed for the team"}
      />,
    );
    expect(screen.getByText(/Not allowed for the team/)).toBeTruthy();
  });
  it("shows validation errors and is read-only with a reason", async () => {
    const onChange = vi.fn();
    render(
      <ModelsControl
        value={{ access: "selected", modelIds: [], defaultModelId: "" }}
        allowed={allowed}
        onChange={onChange}
        errors={{ models: "Choose at least one model", defaultModelId: "Choose a default model" }}
        disabledReason="Requires team-admin"
      />,
    );
    expect(screen.getByText("Choose at least one model")).toBeTruthy();
    expect(screen.getAllByText("Choose a default model").length).toBeGreaterThan(0);
    expect(screen.getByText("Requires team-admin")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("OrchestrationMark and card", () => {
  it("the diamond is hidden from assistive technology; the card is a labelled region", () => {
    render(
      <OrchestrationCard label="Orchestration agent">
        <OrchestrationMark /> orchestrator
      </OrchestrationCard>,
    );
    expect(screen.getByRole("region", { name: "Orchestration agent" })).toBeTruthy();
    expect(screen.getByText("◆").getAttribute("aria-hidden")).toBe("true");
  });
});
