// `bun tools/codegen/index.ts` regenerates src/generated/; `--check` fails when it would change.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTRACT_DIR } from "../contract-sync.js";
import { emitters } from "./emitters.js";
import { loadContract } from "./loader.js";

const here = dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = join(here, "..", "..", "src", "generated");

export function generate(contractDir: string = CONTRACT_DIR): Record<string, string> {
  const c = loadContract(contractDir);
  const files: Record<string, string> = {};
  for (const emit of Object.values(emitters)) Object.assign(files, emit(c));
  return files;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** Differences between the generated files in memory and those on disk. */
export function diffGenerated(
  files: Record<string, string>,
  dir: string = GENERATED_DIR,
): string[] {
  const out: string[] = [];
  const onDisk = new Set(listFiles(dir).map((p) => relative(dir, p)));
  for (const [name, text] of Object.entries(files)) {
    const p = join(dir, name);
    if (!existsSync(p)) out.push(`missing: ${name}`);
    else if (readFileSync(p, "utf8") !== text) out.push(`differs: ${name}`);
    onDisk.delete(name);
  }
  for (const extra of onDisk) out.push(`stale: ${extra}`);
  return out;
}

export function writeGenerated(files: Record<string, string>, dir: string = GENERATED_DIR): void {
  rmSync(dir, { recursive: true, force: true });
  for (const [name, text] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = generate();
  if (process.argv.includes("--check")) {
    const d = diffGenerated(files);
    if (d.length > 0) {
      console.error(`codegen:check failed (run bun run codegen)\n${d.join("\n")}`);
      process.exit(1);
    }
    console.log("codegen:check ok");
  } else {
    writeGenerated(files);
    console.log(`generated ${Object.keys(files).length} files`);
  }
}
