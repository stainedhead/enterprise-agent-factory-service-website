// `tsdoc`: every export reachable from the emitted index.d.ts has a preceding TSDoc block (WD-24).
// Reads declaration text, not the TypeScript compiler API (TS 7).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DIST = join(here, "..", "dist");

const DECL =
  /^export (?:declare )?(?:abstract )?(?:function|class|const|interface|type|enum|let|var)\s+([A-Za-z_$][\w$]*)/;

interface Decl {
  name: string;
  documented: boolean;
  file: string;
}

function readDecls(file: string, cache: Map<string, Decl[]>): Decl[] {
  const hit = cache.get(file);
  if (hit) return hit;
  const lines = readFileSync(file, "utf8").split("\n");
  const decls: Decl[] = [];
  lines.forEach((line, i) => {
    const m = DECL.exec(line);
    if (!m) return;
    let j = i - 1;
    while (j >= 0 && lines[j]?.trim() === "") j--;
    decls.push({
      name: m[1] as string,
      documented: lines[j]?.trim().endsWith("*/") ?? false,
      file,
    });
  });
  cache.set(file, decls);
  return decls;
}

/** Returns "file: Name" for every reachable export lacking TSDoc. */
export function undocumentedExports(distDir: string = DIST): string[] {
  const cache = new Map<string, Decl[]>();
  const missing = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string, only?: Set<string>) => {
    const key = `${file}:${only ? [...only].join(",") : "*"}`;
    if (seen.has(key)) return;
    seen.add(key);
    const src = readFileSync(file, "utf8");
    for (const d of readDecls(file, cache)) {
      if (only && !only.has(d.name)) continue;
      if (!d.documented) missing.add(`${file.replace(`${distDir}/`, "")}: ${d.name}`);
    }
    const reexport = /export\s+(type\s+)?(?:\*|\{([^}]*)\})\s+from\s+["']([^"']+)["']/g;
    for (const m of src.matchAll(reexport)) {
      const target = resolve(dirname(file), (m[3] as string).replace(/\.js$/, ".d.ts"));
      if (!existsSync(target)) continue;
      const names = m[2]
        ? new Set(
            m[2]
              .split(",")
              .map(
                (s) =>
                  s
                    .trim()
                    .replace(/^type\s+/, "")
                    .split(/\s+as\s+/)[0] as string,
              )
              .filter(Boolean),
          )
        : undefined;
      if (only && names) for (const n of [...names]) if (!only.has(n)) names.delete(n);
      visit(target, names);
    }
  };
  visit(join(distDir, "index.d.ts"));
  return [...missing].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const missing = undocumentedExports();
  if (missing.length > 0) {
    console.error(
      `tsdoc failed: ${missing.length} exports lack TSDoc\n${missing.slice(0, 40).join("\n")}`,
    );
    process.exit(1);
  }
  console.log("tsdoc ok");
}
