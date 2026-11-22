import type { Money } from "../generated/schemas.js";

const MONEY = /^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

/** Validates a decimal string and brands it as {@link Money}. Never accepts a number. */
export function money(value: string): Money {
  if (typeof value !== "string" || !MONEY.test(value)) {
    throw new TypeError("Money is a decimal string with at most 6 fraction digits");
  }
  return value as Money;
}
