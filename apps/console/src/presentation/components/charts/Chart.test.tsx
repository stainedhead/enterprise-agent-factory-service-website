import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../../test/axe.js";
import { contrastRatio } from "../../styles/contrast.js";
import { Chart, niceMax } from "./Chart.js";
import { SERIES_COLORS, SURFACE } from "./palette.js";

const base = {
  title: "Daily spend",
  categories: ["Nov 1", "Nov 2", "Nov 3"],
  series: [
    { id: "bedrock", label: "Bedrock tokens", values: [1, 3, 2] },
    { id: "eks", label: "EKS compute", values: [2, 2, null] },
  ],
  formatValue: (n: number) => `$${n}`,
  unit: "USD",
};

describe("charts (M3-C1)", () => {
  it.each(["bar", "line", "stacked"] as const)(
    "%s chart renders series and passes axe",
    async (kind) => {
      const { container } = render(<Chart {...base} kind={kind} />);
      expect(screen.getByRole("group", { name: "Daily spend chart" })).toBeTruthy();
      expect(screen.getAllByRole("img")).toHaveLength(2);
      await expectNoA11yViolations(container);
    },
  );
  it("has a table alternative with the same data, and keyboard focus per series", async () => {
    render(<Chart {...base} kind="bar" />);
    await userEvent.click(screen.getByText("Data table"));
    const table = screen.getByRole("table", { name: "Daily spend (USD)" });
    expect(within(table).getByRole("row", { name: /Nov 2 \$3 \$2/ })).toBeTruthy();
    expect(within(table).getByRole("row", { name: /Nov 3 \$2 —/ })).toBeTruthy();
    const stops = screen.getAllByRole("img");
    for (const el of stops) expect(el.getAttribute("tabindex")).toBe("0");
    expect(stops[0]?.getAttribute("aria-label")).toBe(
      "Bedrock tokens: total $6, highest $3 on Nov 2",
    );
    expect(stops[1]?.getAttribute("aria-label")).toMatch(/^EKS compute/);
  });
  it("says so when there is no data", () => {
    render(<Chart {...base} kind="line" categories={[]} series={[]} />);
    expect(screen.getByText("No data for this range.")).toBeTruthy();
  });
  it("rounds the axis to a tidy maximum", () => {
    expect([niceMax(0), niceMax(0.7), niceMax(3), niceMax(7), niceMax(23), niceMax(1200)]).toEqual([
      1, 1, 5, 10, 25, 2000,
    ]);
  });
  it("every series colour is at least 3:1 on its surface in light and dark", () => {
    for (const c of SERIES_COLORS.light)
      expect(contrastRatio(c, SURFACE.light)).toBeGreaterThanOrEqual(3);
    for (const c of SERIES_COLORS.dark)
      expect(contrastRatio(c, SURFACE.dark)).toBeGreaterThanOrEqual(3);
  });
});
