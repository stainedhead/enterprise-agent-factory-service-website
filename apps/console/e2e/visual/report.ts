// Side-by-side report for the web lead (W-3): each snapshot beside its mockup, with its approval status.
// Run: `bun e2e/visual/report.ts [path-to-root-repo-docs-ui]`. Output: e2e/visual/report/index.html.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const specs = join(here, "..", "specs");
const mockups =
  process.argv[2] ??
  join(here, "..", "..", "..", "..", "..", "enterprise-agent-factory-service", "docs", "ui");
const approvals = JSON.parse(readFileSync(join(here, "approvals.json"), "utf8")) as Record<
  string,
  { status: string; mockup?: string }
>;

function snapshots(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (!statSync(p).isDirectory()) return [];
    return n.endsWith("-snapshots")
      ? readdirSync(p)
          .filter((f) => f.endsWith(".png"))
          .map((f) => join(p, f))
      : snapshots(p);
  });
}
const img = (p: string | undefined) =>
  p && existsSync(p)
    ? `<img alt="" src="data:image/png;base64,${readFileSync(p).toString("base64")}">`
    : "<p><em>no image</em></p>";

const rows = snapshots(specs).map((snap) => {
  const name = (snap.split("/").pop() ?? "").replace(/-chromium-linux\.png$/, "");
  const a = approvals[name.toUpperCase()] ?? { status: "pending" };
  const mock = a.mockup ? join(mockups, a.mockup) : undefined;
  return `<section><h2>${name} <small>${a.status}</small></h2><div class="pair"><figure>${img(mock)}<figcaption>Mockup</figcaption></figure><figure>${img(snap)}<figcaption>Snapshot</figcaption></figure></div></section>`;
});

mkdirSync(join(here, "report"), { recursive: true });
writeFileSync(
  join(here, "report", "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Visual report</title><style>body{font:14px system-ui;margin:16px}.pair{display:flex;gap:16px}figure{margin:0;flex:1}img{width:100%;border:1px solid #ccc}small{color:#855900}</style><h1>Mockup and snapshot</h1>${rows.join("")}`,
);
console.log(`wrote report with ${rows.length} snapshots`);
