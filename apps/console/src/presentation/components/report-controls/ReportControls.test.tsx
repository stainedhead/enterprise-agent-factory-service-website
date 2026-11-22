import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../../test/axe.js";
import {
  controlsFromParams,
  controlsToParams,
  DEFAULT_CONTROLS,
  type ReportControlsValue,
  toReportQuery,
  validateControls,
} from "./query.js";
import { ReportControls } from "./ReportControls.js";

describe("report query (M3-C2)", () => {
  it("maps presets, group by tag keys and filters to the contract's query", () => {
    expect(
      toReportQuery({
        range: "7d",
        groupBy: ["tag:cost-center"],
        filters: { agentId: "agt_1", modelId: "" },
      }),
    ).toEqual({ range: "7d", groupBy: ["tag:cost-center"], agentId: "agt_1" });
  });
  it("sends a custom range as from and to instants", () => {
    expect(
      toReportQuery({
        range: "custom",
        from: "2026-11-01",
        to: "2026-11-15",
        groupBy: ["day"],
        filters: {},
      }),
    ).toEqual({ from: "2026-11-01T00:00:00Z", to: "2026-11-15T23:59:59Z", groupBy: ["day"] });
  });
  it("refuses a custom range without dates or backwards", () => {
    expect(validateControls({ range: "custom", groupBy: [], filters: {} })).toEqual({
      from: "Choose a start date",
      to: "Choose an end date",
    });
    expect(
      validateControls({
        range: "custom",
        from: "2026-11-15",
        to: "2026-11-01",
        groupBy: [],
        filters: {},
      }).to,
    ).toBe("The end must not be before the start");
  });
  it("round-trips through URL parameters and ignores unknown ranges", () => {
    const v: ReportControlsValue = {
      range: "custom",
      from: "2026-11-01",
      to: "2026-11-02",
      groupBy: ["agent"],
      filters: { poolId: "pool_1" },
    };
    expect(controlsFromParams(controlsToParams(v))).toEqual(v);
    expect(controlsFromParams(new URLSearchParams("range=bogus")).range).toBe(
      DEFAULT_CONTROLS.range,
    );
  });
});

function Harness({ initial = DEFAULT_CONTROLS }: { initial?: ReportControlsValue }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <ReportControls
        value={v}
        onChange={setV}
        groupBy={["agent", "day"]}
        tagKeys={["cost-center"]}
        filters={["agentId"]}
      />
      <output data-testid="q">{JSON.stringify(toReportQuery(v))}</output>
    </>
  );
}

describe("ReportControls (M3-C2)", () => {
  it("offers every range, tag keys in group by, and a custom range with field errors", async () => {
    const { container } = render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText("Group by"), "tag:cost-center");
    await userEvent.type(screen.getByLabelText("Agent"), "agt_9");
    expect(screen.getByTestId("q").textContent).toContain('"groupBy":["tag:cost-center"]');
    expect(screen.getByTestId("q").textContent).toContain('"agentId":"agt_9"');
    await userEvent.selectOptions(screen.getByLabelText("Range"), "custom");
    await userEvent.type(screen.getByLabelText("From"), "2026-11-10");
    await userEvent.type(screen.getByLabelText("To"), "2026-11-01");
    expect(screen.getByText("The end must not be before the start")).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("q").textContent).not.toContain("groupBy");
  });
});
