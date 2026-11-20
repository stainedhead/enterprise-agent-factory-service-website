// Enforces the clean-architecture dependency rule by scanning imports.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url).pathname;

const FORBIDDEN: Record<string, RegExp[]> = {
  domain: [
    /\/application\//,
    /\/infrastructure\//,
    /\/presentation\//,
    /\/main\//,
    /^@afs\/sdk/,
    /^react/,
  ],
  application: [/\/infrastructure\//, /\/presentation\//, /\/main\//, /^@afs\/sdk/, /^react/],
  infrastructure: [/\/presentation\//, /\/main\//],
  presentation: [/\/infrastructure\//, /\/main\//, /^@afs\/sdk/],
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

describe("dependency rule", () => {
  for (const [layer, rules] of Object.entries(FORBIDDEN)) {
    it(`${layer}/ does not import outer layers`, () => {
      const violations: string[] = [];
      for (const file of files(join(SRC, layer))) {
        const imports = [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map(
          (m) => m[1] ?? "",
        );
        for (const spec of imports) {
          const resolved = spec.startsWith(".")
            ? `/${relative(SRC, join(file, "..", spec))}`
            : spec;
          if (rules.some((r) => r.test(resolved)))
            violations.push(`${relative(SRC, file)} -> ${spec}`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
