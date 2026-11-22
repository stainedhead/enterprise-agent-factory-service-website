// Builds the publishable package directory for GitHub Packages: the compiled `dist` plus a package.json whose
// name and version are set for the registry. The workspace's own package.json keeps the name `@afs/sdk`.
//   bun tools/prepare-publish.ts <outDir> [<tag-or-version>]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLISHED_NAME = "@stainedhead/afs-sdk";
export const REGISTRY = "https://npm.pkg.github.com";
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** `sdk-v1.2.3`, `v1.2.3` and `1.2.3` all give `1.2.3`; anything else is refused. */
export function versionFrom(input: string): string {
  const v = input
    .replace(/^refs\/tags\//, "")
    .replace(/^sdk-/, "")
    .replace(/^v/, "");
  if (!SEMVER.test(v)) throw new Error(`Not a version: ${input}`);
  return v;
}

const withoutSource = (c: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(c).filter(([k]) => k !== "source"));

/** The registry manifest derived from the workspace manifest; scripts and dev dependencies are dropped. */
export function registryManifest(
  workspace: Record<string, unknown>,
  version: string,
  repo: string,
): Record<string, unknown> {
  const { scripts: _s, devDependencies: _d, private: _p, ...rest } = workspace;
  // the `source` condition points into `src`, which is not published
  const exp = rest.exports as Record<string, Record<string, unknown>> | undefined;
  const root = exp?.["."];
  const exports = exp && root ? { ...exp, ".": withoutSource(root) } : exp;
  return {
    ...rest,
    ...(exports && { exports }),
    name: PUBLISHED_NAME,
    version,
    files: ["dist"],
    publishConfig: { registry: REGISTRY, access: "restricted" },
    repository: {
      type: "git",
      url: `git+https://github.com/${repo}.git`,
      directory: "packages/sdk",
    },
  };
}

if (import.meta.main) {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgDir = resolve(here, "..");
  const [outArg, versionArg] = process.argv.slice(2);
  if (!outArg) throw new Error("usage: prepare-publish.ts <outDir> [tag-or-version]");
  if (!existsSync(join(pkgDir, "dist"))) throw new Error("dist is missing: run the build first");
  const workspace = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const version = versionFrom(versionArg ?? String(workspace.version));
  const repo =
    process.env.GITHUB_REPOSITORY ?? "stainedhead/enterprise-agent-factory-service-website";
  const out = resolve(outArg);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(pkgDir, "dist"), join(out, "dist"), { recursive: true });
  writeFileSync(
    join(out, "package.json"),
    `${JSON.stringify(registryManifest(workspace, version, repo), null, 2)}\n`,
  );
  console.log(`prepared ${PUBLISHED_NAME}@${version} in ${out}`);
}
