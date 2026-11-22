import { describe, expect, it } from "vitest";
import { add, compare, format, isZero, parse, percent, subtract, toMoney } from "./money.js";

describe("money (M0-D5)", () => {
  it("parses and prints without floating point", () => {
    expect(parse("1234.50")).toBe(1234500000n);
    expect(toMoney(parse("0.1"))).toBe("0.10");
    expect(toMoney(parse("-5"))).toBe("-5.00");
    expect(toMoney(parse("0.000123"))).toBe("0.000123");
  });
  it("adds exactly where floats do not", () => {
    expect(add("0.1", "0.2")).toBe("0.30");
    expect(add("999999999999.999999", "0.000001")).toBe("1000000000000.00");
    expect(subtract("1.00", "2.50")).toBe("-1.50");
  });
  it("compares", () => {
    expect(compare("1.10", "1.1")).toBe(0);
    expect(compare("2", "10")).toBe(-1);
    expect(compare("-1", "-2")).toBe(1);
    expect(isZero("0.000000")).toBe(true);
    expect(isZero("0.000001")).toBe(false);
  });
  it("computes percentages and guards zero", () => {
    expect(percent("80", "100")).toBe(80);
    expect(percent("1", "3")).toBe(33.33);
    expect(percent("5", "0.00")).toBe(0);
  });
  it("formats with grouping", () => {
    expect(format("1234.5")).toBe("$1,234.50");
    expect(format("-1234567.891")).toBe("-$1,234,567.891");
    expect(format("0")).toBe("$0.00");
  });
  it("rejects anything that is not a contract money string", () => {
    for (const bad of ["1e3", "1,000", "", "1.1234567", "01", "abc", " 1"])
      expect(() => parse(bad), bad).toThrow(TypeError);
  });
});
