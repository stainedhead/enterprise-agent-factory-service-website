// `size:sdk`: gzip size of the SDK core (with AfsClient) and of each resource module (WD-23).
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");
export const CORE_LIMIT = 25 * 1024;
export const MODULE_LIMIT = 3 * 1024;

/** Bundles `entry` (unminified names kept for the tree-shake test) and returns the JS text. */
export async function bundle(
  entry: string,
  opts: { minify: boolean; external?: RegExp },
): Promise<string> {
  const out = await build({
    configFile: false,
    logLevel: "silent",
    root: here,
    build: {
      write: false,
      minify: opts.minify,
      lib: { entry, formats: ["es"], fileName: "out" },
      rollupOptions: opts.external ? { external: opts.external } : {},
    },
  });
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) =>
    "output" in o ? o.output : [],
  );
  const chunk = outputs.find((o) => o.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error(`no output for ${entry}`);
  return chunk.code;
}

export const gzipBytes = (code: string) => gzipSync(code).length;

export async function measure(): Promise<{ core: number; modules: Record<string, number> }> {
  const core = gzipBytes(await bundle(join(SRC, "core", "client.ts"), { minify: true }));
  const modules: Record<string, number> = {};
  const dir = join(SRC, "generated", "resources");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    modules[f.replace(/\.ts$/, "")] = gzipBytes(
      await bundle(join(dir, f), { minify: true, external: /core\/client/ }),
    );
  }
  return { core, modules };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { core, modules } = await measure();
  const over = Object.entries(modules).filter(([, v]) => v > MODULE_LIMIT);
  const biggest = Object.entries(modules).sort((a, b) => b[1] - a[1])[0];
  console.log(
    `size:sdk core ${core} B gzip (limit ${CORE_LIMIT}); largest module ${biggest?.[0]} ${biggest?.[1]} B (limit ${MODULE_LIMIT})`,
  );
  if (core > CORE_LIMIT || over.length > 0) {
    console.error(
      `size:sdk failed: ${core > CORE_LIMIT ? "core " : ""}${over.map(([k, v]) => `${k}=${v}`).join(" ")}`,
    );
    process.exit(1);
  }
}
