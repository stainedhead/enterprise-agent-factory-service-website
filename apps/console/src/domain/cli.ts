/** An `afs` CLI command preview: `afs <service> <operation> --flag value ...` (WEB-6). */
export interface CliCommand {
  readonly service: string;
  readonly operation: string;
  readonly args: readonly (readonly [
    flag: string,
    value: string | readonly string[] | undefined,
  ])[];
}

const SAFE = /^[A-Za-z0-9_./:=@+-]+$/;
const quote = (v: string): string => (SAFE.test(v) ? v : `'${v.replace(/'/g, "'\\''")}'`);

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
