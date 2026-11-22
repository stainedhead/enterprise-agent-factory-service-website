import { type CliField, type CliOperation, cliOperations } from "./generated/cliOperations.js";

/** An `afs` CLI command preview: `afs <service> <operation> --flag value ...` (WEB-6). */
export interface CliCommand {
  readonly service: string;
  readonly operation: string;
  readonly args: readonly (readonly [
    flag: string,
    value: string | readonly string[] | undefined,
  ])[];
}

const SAFE = /^[A-Za-z0-9_./:=@+,-]+$/;
const quote = (v: string): string =>
  SAFE.test(v) || v === "file://<path>" ? v : `'${v.replace(/'/g, "'\\''")}'`;

/** Renders the command line. Lists are space-separated; empty values are skipped. */
export function renderCli(cmd: CliCommand): string {
  const parts = ["afs", cmd.service, cmd.operation];
  for (const [flag, value] of cmd.args) {
    if (value === undefined || (Array.isArray(value) && value.length === 0) || value === "")
      continue;
    const vals = Array.isArray(value) ? (value as readonly string[]) : [value as string];
    parts.push(`--${flag}`, ...vals.map(quote));
  }
  return parts.join(" ");
}

/** Placeholder rendered in place of a secret value: the CLI reads it from a file, never from an argument. */
export const SECRET_FILE_PLACEHOLDER = "file://<path>";

/** What a form holds for one field: a scalar, a list of scalars, or a JSON-able object. */
export type CliValue = string | number | boolean | readonly string[] | object | null | undefined;

const scalar = (v: string | number | boolean): string => String(v);

function render1(f: CliField, v: CliValue): string | readonly string[] | undefined {
  if (f.secret) return SECRET_FILE_PLACEHOLDER; // the value itself is never read
  if (v === undefined || v === null || v === "") return undefined;
  if (f.kind === "json" || (typeof v === "object" && !Array.isArray(v))) return JSON.stringify(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : scalar(x)));
  return scalar(v as string | number | boolean);
}

/** The flag of a field; a secret `value` is `--secret-value` (solution-design §11). */
const flagOf = (f: CliField): string => (f.secret && f.flag === "value" ? "secret-value" : f.flag);

/**
 * Builds the CLI command for `operationId` from form values keyed by the API field names (WEB-6, WD-17).
 * Path and query parameters come first, then body fields in the contract's order. Unknown names throw so
 * a typo fails a test instead of printing a wrong command. Secret fields render `file://<path>` and never
 * read the value.
 */
export function buildCli(
  operationId: string,
  values: Readonly<Record<string, CliValue>>,
): CliCommand {
  const op: CliOperation | undefined = cliOperations[operationId];
  if (!op) throw new Error(`No CLI operation for ${operationId}`);
  const known = new Set([...op.path, ...op.query, ...op.body].map((f) => f.name));
  for (const k of Object.keys(values))
    if (!known.has(k)) throw new Error(`${operationId} has no field "${k}"`);
  const args: [string, string | readonly string[] | undefined][] = [];
  for (const f of [...op.path, ...op.query, ...op.body]) {
    const secret = op.body.find((b) => b.name === f.name)?.secret;
    // a secret field is shown as a placeholder whenever the form has it at all
    if (secret) {
      if (f.name in values) args.push([flagOf(f), SECRET_FILE_PLACEHOLDER]);
      continue;
    }
    args.push([f.flag, render1(f, values[f.name])]);
  }
  return { service: op.service, operation: op.operation, args };
}
