// Shared list (architecture.md §3.2): one line per emitter. Each returns files relative to src/generated/.

import { emitCliTable } from "./emit-cli-table.js";
import { emitOperations } from "./emit-operations.js";
import { emitIndex, emitResourceModules } from "./emit-resources.js";
import { emitSchemas } from "./emit-schemas.js";
import type { Contract } from "./ir.js";

export type Emitter = (c: Contract) => Record<string, string>;

export const emitters: Record<string, Emitter> = {
  schemas: (c) => ({ "schemas.ts": emitSchemas(c) }),
  operations: (c) => ({ "operations.ts": emitOperations(c) }),
  resources: (c) => ({ ...emitResourceModules(c), "index.ts": emitIndex(c) }),
};

/** Emitters whose output lives in the console, not the SDK (`apps/console/src/domain/generated/`). */
export const consoleEmitters: Record<string, Emitter> = {
  cliTable: (c) => ({ "cliOperations.ts": emitCliTable(c) }),
};
