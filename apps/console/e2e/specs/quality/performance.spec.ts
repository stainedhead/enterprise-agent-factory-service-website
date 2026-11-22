import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { openFrozen, spaGo } from "../../helpers/clock.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

/** 40 ms round trip and 50 Mbit/s (NFR-1), through the DevTools protocol; Chromium only. */
async function throttle(page: import("@playwright/test").Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 40,
    downloadThroughput: (50 * 1_000_000) / 8,
    uploadThroughput: (50 * 1_000_000) / 8,
  });
}

test.describe("M6-Q5 performance (NFR-1)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "network emulation is Chromium-only");

  const fcpOf = (page: import("@playwright/test").Page) =>
    page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime);

  test("first contentful paint of the signed-in shell (after the redirect back) is under 1.5 s", async ({
    page,
    signInAs,
  }) => {
    await throttle(page);
    await signInAs("svc-admin", "/");
    const fcp = await fcpOf(page);
    expect(fcp, "first-contentful-paint entry").toBeDefined();
    expect(fcp as number, `FCP ${Math.round(fcp as number)} ms`).toBeLessThan(1500);
  });

  test("a route change with cached data shows its page within 300 ms", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "team-admin", `/t/${T}/agents`);
    const routes: [string, RegExp][] = [
      [`/t/${T}/agents`, /Agents/],
      [`/t/${T}/members`, /Members/],
      [`/t/${T}/secrets`, /Secrets/],
      [`/t/${T}/budget`, /Budget/],
    ];
    // first visit warms the chunks and the query cache
    for (const [path, h1] of routes) {
      await spaGo(page, path);
      await expect(page.getByRole("heading", { level: 1, name: h1 }).first()).toBeVisible();
    }
    await throttle(page);
    const times: number[] = [];
    // the page is on the last route after warming, so the first change here is a real one
    for (const [path, h1] of routes) {
      const ms = await page.evaluate(
        ({ p, src }) =>
          new Promise<number>((resolve) => {
            const re = new RegExp(src);
            const t0 = performance.now();
            const done = () => {
              const h = document.querySelector("h1");
              if (h && re.test(h.textContent ?? "")) {
                obs.disconnect();
                resolve(performance.now() - t0);
              }
            };
            const obs = new MutationObserver(done);
            obs.observe(document.body, { childList: true, subtree: true, characterData: true });
            history.pushState({}, "", p);
            dispatchEvent(new PopStateEvent("popstate"));
          }),
        { p: path, src: h1.source },
      );
      times.push(ms);
    }
    for (const ms of times) expect(ms, times.map(Math.round).join(", ")).toBeLessThan(300);
  });
});
