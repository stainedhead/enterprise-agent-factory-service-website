// Contract snapshot tooling (WD-2): `contract:check` verifies the pinned files against
// contract.lock.json; `contract:update --ref <ref>` re-pins them from GitHub and regenerates.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CONTRACT_FILES = ["openapi.yaml", "permissions.json", "operations.json"] as const;
export type ContractFile = (typeof CONTRACT_FILES)[number];

export interface ContractLock {
  source: string;
  ref: string;
  commit: string;
  contractVersion: string;
  files: Record<ContractFile, string>;
  pinnedAt: string;
}

const SOURCE_PATHS: Record<ContractFile, string> = {
  "openapi.yaml": "api/openapi.yaml",
  "permissions.json": "api/contract/permissions.json",
  "operations.json": "api/contract/operations.json",
};

const here = dirname(fileURLToPath(import.meta.url));
export const CONTRACT_DIR = join(here, "..", "contract");

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Returns one message per mismatch between the files in `dir` and the lock; empty when clean. */
export function checkContract(dir: string = CONTRACT_DIR): string[] {
  const lock = JSON.parse(readFileSync(join(dir, "contract.lock.json"), "utf8")) as ContractLock;
  const problems: string[] = [];
  for (const f of CONTRACT_FILES) {
    const actual = sha256(readFileSync(join(dir, f)));
    if (actual !== lock.files[f]) problems.push(`${f}: sha256 ${actual} does not match the lock`);
  }
  return problems;
}

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Fetches the three files at `ref` and rewrites the lock. Returns the new lock. */
export async function updateContract(opts: {
  ref: string;
  dir?: string;
  fetch?: Fetcher;
  repo?: string;
  commit?: string;
  now?: () => Date;
}): Promise<ContractLock> {
  const dir = opts.dir ?? CONTRACT_DIR;
  const doFetch = opts.fetch ?? ((u: string) => fetch(u));
  const repo = opts.repo ?? "stainedhead/enterprise-agent-factory-service-restapi";
  const files = {} as Record<ContractFile, string>;
  let openapi = "";
  for (const f of CONTRACT_FILES) {
    const url = `https://raw.githubusercontent.com/${repo}/${opts.ref}/${SOURCE_PATHS[f]}`;
    const res = await doFetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
    const text = await res.text();
    writeFileSync(join(dir, f), text);
    files[f] = sha256(text);
    if (f === "openapi.yaml") openapi = text;
  }
  const version = /^\s{2}version:\s*["']?([0-9][^"'\s]*)/m.exec(openapi.split("\npaths:")[0] ?? "");
  const lock: ContractLock = {
    source: `github.com/${repo}`,
    ref: opts.ref,
    commit: opts.commit ?? opts.ref,
    contractVersion: version?.[1] ?? "unknown",
    files,
    pinnedAt: (opts.now?.() ?? new Date()).toISOString(),
  };
  writeFileSync(join(dir, "contract.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "check") {
    const problems = checkContract();
    if (problems.length > 0) {
      console.error(`contract:check failed\n${problems.join("\n")}`);
      process.exit(1);
    }
    console.log("contract:check ok");
  } else if (cmd === "update") {
    const i = rest.indexOf("--ref");
    const ref = i >= 0 ? rest[i + 1] : undefined;
    if (!ref) {
      console.error("usage: contract-sync update --ref <tag|commit>");
      process.exit(2);
    }
    const lock = await updateContract({ ref });
    console.log(`pinned ${lock.ref} (contract ${lock.contractVersion}); now run: bun run codegen`);
  } else {
    console.error("usage: contract-sync check | update --ref <ref>");
    process.exit(2);
  }
}
