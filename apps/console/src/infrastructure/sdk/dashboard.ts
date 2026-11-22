import { type AfsClient, adminPriceProposals, adminReconciliations, health } from "@afs/sdk";
import type {
  CountRecord,
  DashboardPort,
  ReadinessRecord,
} from "../../application/ports/dashboard.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};
const PAGE = 100;

const countOf = (page: {
  items: readonly unknown[];
  nextToken?: string | undefined;
}): CountRecord => ({
  count: page.items.length,
  more: page.nextToken !== undefined,
});

/** Readiness and the two warning counts of the dashboard banner. */
export class SdkDashboard implements DashboardPort {
  constructor(private readonly client: AfsClient) {}

  readiness(signal?: AbortSignal): Promise<ReadinessRecord> {
    return wrap(async () => {
      const r = await health(this.client).getReadiness(sig(signal));
      return {
        status: r.status,
        checks: Object.fromEntries(Object.entries(r.checks ?? {}).map(([k, v]) => [k, String(v)])),
      };
    });
  }
  varianceDays(signal?: AbortSignal): Promise<CountRecord> {
    return wrap(async () =>
      countOf(
        await adminReconciliations(this.client)
          .list({ status: "over_threshold", maxResults: PAGE, ...sig(signal) })
          .first(),
      ),
    );
  }
  pendingProposals(signal?: AbortSignal): Promise<CountRecord> {
    return wrap(async () =>
      countOf(
        await adminPriceProposals(this.client)
          .list({ status: "pending", maxResults: PAGE, ...sig(signal) })
          .first(),
      ),
    );
  }
}
