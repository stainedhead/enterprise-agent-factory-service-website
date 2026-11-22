import { describe, expect, it } from "vitest";
import { PUBLISHED_NAME, REGISTRY, registryManifest, versionFrom } from "./prepare-publish.js";

describe("prepare-publish", () => {
  it("reads the version from a tag, a v-prefix or a bare version", () => {
    expect(versionFrom("refs/tags/sdk-v1.2.3")).toBe("1.2.3");
    expect(versionFrom("sdk-v0.3.0-rc.1")).toBe("0.3.0-rc.1");
    expect(versionFrom("v2.0.0")).toBe("2.0.0");
    expect(versionFrom("0.2.0")).toBe("0.2.0");
  });
  it("refuses anything that is not a version", () => {
    expect(() => versionFrom("sdk-vlatest")).toThrow(/Not a version/);
    expect(() => versionFrom("1.2")).toThrow();
  });
  it("sets name, version, registry, repository and files, and drops scripts", () => {
    const m = registryManifest(
      {
        name: "@afs/sdk",
        version: "0.2.0",
        type: "module",
        exports: { ".": { source: "./src/index.ts", import: "./dist/index.js" } },
        scripts: { a: "b" },
        devDependencies: { x: "1" },
      },
      "0.3.0",
      "stainedhead/repo",
    );
    expect(m.name).toBe(PUBLISHED_NAME);
    expect(m.version).toBe("0.3.0");
    expect(m.files).toEqual(["dist"]);
    expect(m.publishConfig).toMatchObject({ registry: REGISTRY });
    expect(m.repository).toMatchObject({ url: "git+https://github.com/stainedhead/repo.git" });
    expect(m).not.toHaveProperty("scripts");
    expect(m).not.toHaveProperty("devDependencies");
    expect(m.type).toBe("module");
    expect(m.exports).toEqual({ ".": { import: "./dist/index.js" } });
  });
});
