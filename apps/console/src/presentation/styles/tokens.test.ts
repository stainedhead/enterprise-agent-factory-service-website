import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} missing`);
  return m[1] as string;
};

describe("design tokens (M0-U1)", () => {
  it("carries the mockup palette and sizes", () => {
    expect(token("nav")).toBe("#0f141a");
    expect(token("link")).toBe("#006ce0");
    expect(css).toContain("--header-h: 40px");
    expect(css).toContain("--side-w: 232px");
    expect(css).toContain('"Open Sans"');
    expect(css).toContain("--fs: 14px");
  });
  it("role pill colours match the mockups", () => {
    expect(token("pill-admin-line")).toBe("#ff9900");
    expect(token("pill-ta-line")).toBe("#5fa8ff");
    expect(token("pill-tv-line")).toBe("#9aa5b1");
    expect(token("pill-so-line")).toBe("#ff5d64");
  });
  const AA = 4.5;
  it.each([
    ["text", "bg"],
    ["text", "page"],
    ["muted", "bg"],
    ["muted", "page"],
    ["placeholder", "bg"],
    ["link", "bg"],
    ["link", "page"],
    ["green", "bg"],
    ["red", "bg"],
    ["red", "err-bg"],
    ["amber", "bg"],
    ["amber", "warn-bg"],
    ["purple", "bg"],
    ["bg", "blue"],
    ["bg", "blue-d"],
    ["text", "info-bg"],
    ["text", "warn-bg"],
    ["text", "err-bg"],
    ["green", "ok-bg"],
    ["pill-admin", "nav"],
    ["pill-ta", "nav"],
    ["pill-tv", "nav"],
    ["pill-so", "nav"],
    ["bg", "nav"],
  ])("%s on %s meets AA (4.5:1)", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(AA);
  });
});
