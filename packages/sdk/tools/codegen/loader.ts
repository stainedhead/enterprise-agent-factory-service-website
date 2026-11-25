import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Contract, Node, OperationIR, ParamIR, ReaderIR } from "./ir.js";
import {
  SECRET_ALLOWED,
  SECRET_ALLOWED_OPS,
  SECRET_FIELDS,
  SECRET_LOOKING,
} from "./secret-fields.js";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * SDK names the contract gets wrong. Contract v1.5.0 gives both `GetInferenceReport` and
 * `GetTeamInferenceReport` `reports.inference()`; the team variant becomes `reports.teamInference()`,
 * matching `reports.team()` beside `reports.service()` (1.2.0 spec). Contract v1.6.0 gives eleven MCP
 * and federated-identity operations a name without a namespace (`.reject()`, `.delete()`); each takes
 * the namespace of its sibling operations on the same resource (1.3.0 spec, contract note 1).
 */
export const SDK_RENAMES: Readonly<Record<string, string>> = {
  GetTeamInferenceReport: "reports.teamInference()",
  RejectMcpPrimitive: "mcpServers.rejectPrimitive()",
  RejectMcpServer: "mcpServers.reject()",
  RequestMcpServerChanges: "mcpServers.requestChanges()",
  ResumeMcpServer: "mcpServers.resume()",
  RetireMcpServer: "mcpServers.retire()",
  StopMcpQueryCapture: "mcpSettings.stopQueryCapture()",
  DeleteTeamMcpServer: "teams.mcpServers.delete()",
  RejectTeamMcpPrimitive: "teams.mcpServers.rejectPrimitive()",
  RejectTeamMcpServer: "teams.mcpServers.reject()",
  DeleteAgentFederatedIdentity: "agents.federatedIdentities.delete()",
  DeletePoolFederatedIdentity: "pools.federatedIdentities.delete()",
};

export function loadContract(dir: string): Contract {
  const doc: Node = parse(readFileSync(join(dir, "openapi.yaml"), "utf8"));
  const deref = (n: Node): Node => {
    let cur = n;
    const seen = new Set<string>();
    while (cur && typeof cur === "object" && typeof cur.$ref === "string") {
      if (seen.has(cur.$ref)) throw new Error(`cyclic $ref ${cur.$ref}`);
      seen.add(cur.$ref);
      cur = cur.$ref
        .replace(/^#\//, "")
        .split("/")
        .reduce((acc: Node, k: string) => acc?.[k], doc);
      if (cur === undefined) throw new Error(`unresolved $ref ${n.$ref}`);
    }
    return cur;
  };
  const refName = (n: Node): string | undefined =>
    typeof n?.$ref === "string" && n.$ref.startsWith("#/components/schemas/")
      ? n.$ref.split("/").pop()
      : undefined;

  const raw: { path: string; method: string; op: Node }[] = [];
  for (const [path, item] of Object.entries<Node>(doc.paths)) {
    for (const m of METHODS) {
      // `x-afs-sdk: none` marks a browser-only endpoint (CompleteMcpOAuthConnect, contract v1.6.0):
      // the identity provider redirects the browser there, so the SDK has no method for it.
      if (item[m] && item[m]["x-afs-sdk"] !== "none") raw.push({ path, method: m, op: item[m] });
    }
  }

  const operations: OperationIR[] = raw.map(({ path, method, op }) => {
    const params: Node[] = (op.parameters ?? []).map((p: Node) => ({ ref: p.$ref, ...deref(p) }));
    const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] as string);
    const queryParams: ParamIR[] = params
      .filter((p) => p.in === "query")
      .map((p) => ({ name: p.name, schema: p.schema ?? {}, required: p.required === true }));
    const ifMatchRef = params.find((p) => p.in === "header" && p.name === "If-Match");
    const ifMatch = ifMatchRef ? (ifMatchRef.required ? "required" : "optional") : "none";
    const idempotencyKey = params.some((p) => p.in === "header" && p.name === "Idempotency-Key");
    const body = op.requestBody?.content?.["application/json"];
    const responses = Object.entries<Node>(op.responses)
      .filter(([s]) => s.startsWith("2"))
      .map(([s, r]) => {
        const resp = deref(r);
        const content = resp.content ?? {};
        const types = Object.keys(content);
        const json = content["application/json"] ?? content["application/yaml"];
        return { status: Number(s), schema: json?.schema, contentTypes: types };
      });
    const sdk = SDK_RENAMES[String(op.operationId)] ?? String(op["x-afs-sdk"]);
    const sm = /^([A-Za-z0-9.]+)\.([A-Za-z0-9]+)\(\)$/.exec(sdk);
    if (!sm) throw new Error(`${op.operationId}: bad x-afs-sdk ${sdk}`);
    const namespace = (sm[1] as string).split(".");
    const module =
      namespace[0] === "admin" && namespace[1] ? `admin-${namespace[1]}` : (namespace[0] as string);
    const ok = responses.find((r) => r.status !== 204) ?? responses[0];
    const respSchema = ok?.schema ? deref(ok.schema) : undefined;
    const list = !!respSchema?.properties?.items && !!respSchema?.properties?.nextToken;
    return {
      operationId: op.operationId,
      method: method.toUpperCase() as OperationIR["method"],
      path,
      pathParams,
      queryParams,
      ...(body
        ? { requestBody: { schema: body.schema, required: op.requestBody.required === true } }
        : {}),
      responses,
      sdk: { namespace, method: sm[2] as string },
      module,
      cli: op["x-afs-cli"] ?? "",
      permission: op["x-afs-permission"] ?? "",
      scope: op["x-afs-scope"] ?? "",
      screen: op["x-afs-screen"] ?? "",
      priority: op["x-afs-priority"] ?? "",
      csv: op["x-afs-csv"] === true,
      yaml: responses.some((r) => r.contentTypes.includes("application/yaml")),
      list,
      summary: op.summary ?? "",
      deprecated: op.deprecated === true,
      ifMatch,
      idempotencyKey,
      versionless: false,
      secretFields: [],
    } satisfies OperationIR;
  });

  // Readers (research.md §3).
  const byPath = new Map<string, OperationIR[]>();
  for (const o of operations) byPath.set(o.path, [...(byPath.get(o.path) ?? []), o]);
  const getAt = (p: string) => byPath.get(p)?.find((o) => o.method === "GET");
  const itemSchema = (o: OperationIR): Node | undefined => {
    const r = o.responses.find((x) => x.status === 200);
    const s = r?.schema ? deref(r.schema) : undefined;
    return s?.properties?.items?.items ? deref(s.properties.items.items) : undefined;
  };
  const responseSchema = (o: OperationIR): Node | undefined => {
    const r = o.responses.find((x) => x.status === 200);
    return r?.schema ? deref(r.schema) : undefined;
  };
  for (const o of operations) {
    if (o.ifMatch === "none") continue;
    let reader: ReaderIR | undefined;
    let schema: Node | undefined;
    const same = getAt(o.path);
    if (same) {
      reader = { operationId: same.operationId, kind: "get", match: [] };
      schema = responseSchema(same);
    } else {
      const trailing: string[] = [];
      let p = o.path;
      for (;;) {
        const m = /\/\{([^}]+)\}$/.exec(p);
        if (!m) break;
        trailing.unshift(m[1] as string);
        p = p.slice(0, m.index);
      }
      const parent = trailing.length > 0 ? getAt(p) : undefined;
      const item = parent ? itemSchema(parent) : undefined;
      // A plain `{items}` list without nextToken (ListInferenceProviders, contract v1.5.0) is a
      // reader only where If-Match is required, so optional If-Match operations keep 1.1.0 behaviour.
      if (parent && item && (parent.list || o.ifMatch === "required")) {
        const props = Object.keys(item.properties ?? {});
        const match: [string, string][] = [];
        // {owner}/{repo} path segments are one "owner/repo" value in the item's `repo` property.
        const tl = [...trailing];
        if (
          tl.length >= 2 &&
          tl.at(-2) === "owner" &&
          tl.at(-1) === "repo" &&
          !props.includes("owner")
        ) {
          tl.splice(-2, 2, "owner/repo");
        }
        for (const param of tl) {
          if (param === "owner/repo") {
            match.push([param, "repo"]);
            continue;
          }
          const cands = [param, "id", param.replace(/Id$/, ""), `${param.replace(/Id$/, "")}Id`];
          const prop = (tl.length === 1 ? cands : [param]).find((c) => props.includes(c));
          if (!prop)
            throw new Error(
              `${o.operationId}: no property for {${param}} in ${parent.operationId} items`,
            );
          match.push([param, prop]);
        }
        reader = { operationId: parent.operationId, kind: "list", match };
        schema = item;
      }
    }
    if (reader) {
      // A wrapper response (TeamMcpServer, contract v1.6.0) carries the version on a nested object.
      const wrapped =
        schema && !("version" in (schema.properties ?? {}))
          ? Object.entries<Node>(schema.properties ?? {}).find(
              ([, p]) => "version" in (deref(p).properties ?? {}),
            )?.[0]
          : undefined;
      // The wrapped version is the inner resource's; an optional If-Match on such a path (PutTeamMcpServer)
      // guards a different row (the team's switch, which has no version on the wire), so it gets no reader.
      if (wrapped && o.ifMatch === "optional") continue;
      if (wrapped) reader.versionIn = wrapped;
      o.reader = reader;
      o.versionless =
        !!schema &&
        !wrapped &&
        !("version" in (schema.properties ?? {})) &&
        o.ifMatch === "required";
    }
  }

  // Secret fields: explicit list plus derived writeOnly / secret-looking request properties.
  for (const o of operations) {
    const fields = new Set<string>(SECRET_FIELDS[o.operationId] ?? []);
    if (o.requestBody) {
      const s = deref(o.requestBody.schema);
      for (const [name, prop] of Object.entries<Node>(s.properties ?? {})) {
        if (deref(prop).writeOnly === true || prop.writeOnly === true) fields.add(name);
      }
    }
    o.secretFields = [...fields].sort();
  }

  const schemas: Record<string, Node> = doc.components.schemas;
  void refName;
  return { version: doc.info.version, operations, schemas };
}

/** Request-body properties that look like secrets but are neither listed nor allowed (test helper). */
export function unlistedSecretLooking(c: Contract): string[] {
  const out: string[] = [];
  for (const o of c.operations) {
    if (!o.requestBody) continue;
    const ref: string | undefined = o.requestBody.schema?.$ref;
    const s: Node = ref ? c.schemas[ref.split("/").pop() as string] : o.requestBody.schema;
    for (const name of Object.keys(s?.properties ?? {})) {
      if (
        SECRET_LOOKING.test(name) &&
        !SECRET_ALLOWED.has(name) &&
        !SECRET_ALLOWED_OPS.has(`${o.operationId}.${name}`) &&
        !o.secretFields.includes(name)
      )
        out.push(`${o.operationId}.${name}`);
    }
  }
  return out;
}
