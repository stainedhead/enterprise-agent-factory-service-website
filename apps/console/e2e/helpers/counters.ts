import { control } from "./control.js";

/** Requests the fake API recorded since the last reset that satisfy `pred`. */
export async function requestsWhere(
  pred: (r: Awaited<ReturnType<typeof control.recorded>>[number]) => boolean,
) {
  return (await control.recorded()).filter(pred);
}

/** Number of mutating (non-GET) requests since the last reset. */
export async function mutatingCount(): Promise<number> {
  return (await requestsWhere((r) => r.mutating)).length;
}

/** Number of requests to one operation within `[from, to]` (epoch ms), for the one-list-query-per-interval rule (WD-21). */
export async function countInWindow(
  operationId: string,
  from: number,
  to: number,
): Promise<number> {
  return (await requestsWhere((r) => r.operationId === operationId && r.at >= from && r.at <= to))
    .length;
}
