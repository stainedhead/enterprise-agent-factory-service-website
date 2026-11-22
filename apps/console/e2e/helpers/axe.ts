import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Runs axe against the page; serious and critical violations fail (WEB-US-42.2). */
export async function expectAxeClean(page: Page, opts: { exclude?: string[] } = {}): Promise<void> {
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  for (const e of opts.exclude ?? []) b = b.exclude(e);
  const { violations } = await b.analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id} (${v.impact}): ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
}
