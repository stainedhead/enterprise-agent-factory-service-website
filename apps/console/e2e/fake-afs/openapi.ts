import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

// biome-ignore lint/suspicious/noExplicitAny: the OpenAPI document is untyped JSON
type Node = any;

const CONTRACT = join(import.meta.dirname, "..", "..", "..", "..", "packages", "sdk", "contract");
const METHODS = ["get", "post", "put", "patch", "delete"];

export interface RouteDef {
  readonly operationId: string;
  readonly method: string;
  readonly template: string;
  readonly regex: RegExp;
  readonly params: readonly string[];
  readonly scope: string | undefined;
  readonly ifMatch: "required" | "optional" | "none";
  readonly idempotent: boolean;
  readonly responses: Record<string, Node>;
}

/** The pinned OpenAPI document: routes by method and path template, and response validation. */
export class Contract {
  readonly doc: Node;
  readonly version: string;
  readonly routes: RouteDef[];

  constructor(dir: string = CONTRACT) {
    this.doc = parse(readFileSync(join(dir, "openapi.yaml"), "utf8"));
    this.version = String(this.doc.info?.version ?? "0.0.0");
    const ops = JSON.parse(readFileSync(join(dir, "operations.json"), "utf8")) as {
      operationId: string;
      scope?: string;
    }[];
    const scope = new Map(ops.map((o) => [o.operationId, o.scope]));
    this.routes = [];
    for (const [template, item] of Object.entries<Node>(this.doc.paths)) {
      for (const m of METHODS) {
        const op = item[m];
        if (!op?.operationId) continue;
        const params = [...template.matchAll(/\{([^}]+)\}/g)].map((x) => x[1] as string);
        const names = (op.parameters ?? []).map((p: Node) => this.deref(p));
        const ifm = names.find((p: Node) => p.in === "header" && p.name === "If-Match");
        this.routes.push({
          operationId: op.operationId,
          method: m.toUpperCase(),
          template,
          regex: new RegExp(`^${template.replace(/\{[^}]+\}/g, "([^/:]+)")}$`),
          params,
          scope: scope.get(op.operationId),
          ifMatch: ifm ? (ifm.required ? "required" : "optional") : "none",
          idempotent: names.some((p: Node) => p.in === "header" && p.name === "Idempotency-Key"),
          responses: op.responses ?? {},
        });
      }
    }
  }

  deref(n: Node): Node {
    let cur = n;
    for (let i = 0; i < 50 && cur && typeof cur === "object" && typeof cur.$ref === "string"; i++) {
      cur = cur.$ref
        .replace(/^#\//, "")
        .split("/")
        .reduce((a: Node, k: string) => a?.[k], this.doc);
    }
    return cur;
  }

  /** The route for a request, preferring the template with the fewest parameters. */
  match(
    method: string,
    pathname: string,
  ): { route: RouteDef; params: Record<string, string> } | undefined {
    const hits: { route: RouteDef; params: Record<string, string> }[] = [];
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      hits.push({
        route: r,
        params: Object.fromEntries(
          r.params.map((p, i) => [p, decodeURIComponent(m[i + 1] as string)]),
        ),
      });
    }
    hits.sort((a, b) => a.route.params.length - b.route.params.length);
    return hits[0];
  }

  /** Errors where `body` does not satisfy the response schema of `status` for the operation; empty when it does. */
  validateResponse(route: RouteDef, status: number, body: unknown): string[] {
    const resp = this.deref(route.responses[String(status)] ?? route.responses.default);
    if (!resp) return [`${route.operationId}: status ${status} is not declared`];
    const schema = resp.content?.["application/json"]?.schema;
    if (!schema)
      return body === undefined || body === null || body === ""
        ? []
        : [`${route.operationId}: ${status} declares no JSON body`];
    return this.validate(schema, body, "$", 0);
  }

  validate(schema: Node, value: unknown, at: string, depth: number): string[] {
    if (depth > 40) return [];
    const s = this.deref(schema);
    if (!s || typeof s !== "object") return [];
    if (value === null && s.nullable === true) return [];
    if (Array.isArray(s.allOf))
      return s.allOf.flatMap((x: Node) => this.validate(x, value, at, depth + 1));
    for (const key of ["oneOf", "anyOf"] as const) {
      if (Array.isArray(s[key])) {
        const results = s[key].map((x: Node) => this.validate(x, value, at, depth + 1));
        return results.some((r: string[]) => r.length === 0)
          ? []
          : [`${at}: matches none of ${key}`];
      }
    }
    const err: string[] = [];
    if (Array.isArray(s.enum) && !s.enum.includes(value))
      err.push(`${at}: ${JSON.stringify(value)} is not in the enum`);
    const type = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
    if (type.length > 0) {
      const actual =
        value === null
          ? "null"
          : Array.isArray(value)
            ? "array"
            : Number.isInteger(value)
              ? "integer"
              : typeof value;
      const ok = type.some((t: string) => t === actual || (t === "number" && actual === "integer"));
      if (!ok) return [...err, `${at}: expected ${type.join("|")}, got ${actual}`];
    }
    if (Array.isArray(value) && s.items) {
      for (const [i, v] of value.entries())
        err.push(...this.validate(s.items, v, `${at}[${i}]`, depth + 1));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const o = value as Record<string, unknown>;
      for (const r of s.required ?? []) if (!(r in o)) err.push(`${at}.${r}: required`);
      for (const [k, sub] of Object.entries<Node>(s.properties ?? {}))
        if (k in o) err.push(...this.validate(sub, o[k], `${at}.${k}`, depth + 1));
    }
    return err;
  }
}
