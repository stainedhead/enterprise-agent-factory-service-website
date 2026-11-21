import axe from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe on `container` and fails on serious or critical violations. Colour contrast is not computed in
 * happy-dom; contrast is covered by the token test and by the Playwright axe runs.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"],
  });
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}
