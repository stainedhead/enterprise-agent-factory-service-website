import { type AfsClient, adminCostTagStatus } from "@afs/sdk";
import type {
  AdminCostTagStatusPort,
  CostTagStatusItem,
} from "../../application/ports/adminCostTagStatus.js";
import { toAppError } from "./errors.js";

/** `admin.costTagStatus.list` mapped to {@link AdminCostTagStatusPort}. */
export class SdkAdminCostTagStatus implements AdminCostTagStatusPort {
  constructor(private readonly client: AfsClient) {}

  async list(signal?: AbortSignal): Promise<readonly CostTagStatusItem[]> {
    try {
      const out: CostTagStatusItem[] = [];
      for await (const t of adminCostTagStatus(this.client).list({
        maxResults: 100,
        ...(signal ? { signal } : {}),
      }))
        out.push({
          key: t.key,
          seenInCur: t.seenInCur,
          firstSeenAt: t.firstSeenAt,
          lastSeenAt: t.lastSeenAt,
          awsStatus: t.awsStatus,
          checkedAt: t.checkedAt,
        });
      return out;
    } catch (e) {
      throw toAppError(e);
    }
  }
}
