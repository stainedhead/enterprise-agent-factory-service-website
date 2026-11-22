// `size:console`: gzip size of the initial route (the files index.html loads) must stay within 300 KB (NFR-1).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
export const LIMIT = 300 * 1024;

/** Gzip bytes of every script and stylesheet that `index.html` in `dist` references. */
export function initialRouteBytes(dist: string): { total: number; files: Record<string, number> } {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map(
    (m) => m[1] as string,
  );
  const files: Record<string, number> = {};
  for (const r of refs) files[r] = gzipSync(readFileSync(join(dist, r))).length;
  return { total: Object.values(files).reduce((a, b) => a + b, 0), files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = join(here, "..", "dist");
  if (!existsSync(join(dist, "index.html"))) {
    console.error("size:console needs a build first (bun run build)");
    process.exit(2);
  }
  const { total } = initialRouteBytes(dist);
  console.log(`size:console initial route ${total} B gzip (limit ${LIMIT})`);
  if (total > LIMIT) process.exit(1);
}
