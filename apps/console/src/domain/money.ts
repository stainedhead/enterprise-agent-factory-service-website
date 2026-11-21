// Decimal arithmetic on `Money` strings with scaled bigint (6 fraction digits). Never `number` (WD-22).
const SCALE = 6;
const ONE = 10n ** BigInt(SCALE);
const PATTERN = /^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

export type Scaled = bigint;

/** Parses a money string into a scaled integer; throws on anything but a contract-valid decimal. */
export function parse(money: string): Scaled {
  if (!PATTERN.test(money)) throw new TypeError("Not a money amount");
  const neg = money.startsWith("-");
  const [whole = "0", frac = ""] = money.replace("-", "").split(".");
  const v = BigInt(whole) * ONE + BigInt(frac.padEnd(SCALE, "0"));
  return neg ? -v : v;
}

/** Formats a scaled integer as a contract money string (trailing zeros trimmed, at least 2 digits). */
export function toMoney(v: Scaled): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / ONE;
  let frac = (abs % ONE).toString().padStart(SCALE, "0").replace(/0+$/, "");
  frac = frac.padEnd(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

export const compare = (a: string, b: string): -1 | 0 | 1 => {
  const x = parse(a);
  const y = parse(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

export const add = (a: string, b: string): string => toMoney(parse(a) + parse(b));
export const subtract = (a: string, b: string): string => toMoney(parse(a) - parse(b));
export const isZero = (a: string): boolean => parse(a) === 0n;

/** `part` as a percentage of `whole`, with two decimals (display only). 0 when `whole` is zero. */
export function percent(part: string, whole: string): number {
  const w = parse(whole);
  if (w === 0n) return 0;
  const basis = (parse(part) * 10_000n) / w;
  return Number(basis) / 100;
}

/** "$1,234.50": grouping, at least two fraction digits, up to six when significant. */
export function format(money: string): string {
  const s = toMoney(parse(money));
  const neg = s.startsWith("-");
  const [whole = "0", frac = "00"] = s.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${grouped}.${frac}`;
}
