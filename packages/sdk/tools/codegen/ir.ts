/** Generator intermediate representation (data-dictionary §2). */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
// biome-ignore lint/suspicious/noExplicitAny: raw OpenAPI nodes are untyped YAML
export type Node = any;

export interface ParamIR {
  name: string;
  schema: Node;
  required: boolean;
}

export interface ReaderIR {
  operationId: string;
  kind: "get" | "list";
  /** [path parameter name ("owner/repo" joins two), item property] pairs matched when kind is "list". */
  match: [string, string][];
}

export interface OperationIR {
  operationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  pathParams: string[];
  queryParams: ParamIR[];
  requestBody?: { schema: Node; required: boolean };
  responses: { status: number; schema?: Node; contentTypes: string[] }[];
  sdk: { namespace: string[]; method: string };
  module: string;
  cli: string;
  permission: string;
  scope: string;
  screen: string;
  priority: string;
  csv: boolean;
  yaml: boolean;
  list: boolean;
  summary: string;
  ifMatch: "required" | "optional" | "none";
  idempotencyKey: boolean;
  reader?: ReaderIR;
  /** The If-Match resource has no `version` property (CQ-2 interim: send "1"). */
  versionless: boolean;
  secretFields: string[];
}

export interface Contract {
  version: string;
  operations: OperationIR[];
  schemas: Record<string, Node>;
}
