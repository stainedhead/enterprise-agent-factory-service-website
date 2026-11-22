import { type AfsClient, logDestinations } from "@afs/sdk";
import type {
  LogDestinationFull,
  LogDestinationInput,
  LogDestinationPatch,
  LogDestinationsPort,
} from "../../application/ports/logDestinations.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof logDestinations>["get"]>>;

const toRecord = (d: Wire): LogDestinationFull => {
  const c = d.status.conditions.find((x) => x.type === "DeliveryHealthy");
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    enabled: d.enabled,
    config: d.config ?? {},
    secretId: d.secretId ?? undefined,
    phase: d.status.phase,
    delivery: c?.status === "True" ? "healthy" : c?.status === "False" ? "failing" : "unknown",
    deliveryMessage: c?.message ?? undefined,
    deliveryAt: c?.lastTransitionTime ?? undefined,
    version: d.version,
  };
};

/** `logDestinations.*` mapped to {@link LogDestinationsPort}. */
export class SdkLogDestinations implements LogDestinationsPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly LogDestinationFull[]> {
    return wrap(async () => {
      const out: LogDestinationFull[] = [];
      for await (const d of logDestinations(this.client).list(teamId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(toRecord(d));
      return out;
    });
  }
  create(teamId: string, input: LogDestinationInput): Promise<LogDestinationFull> {
    return wrap(async () =>
      toRecord(
        await logDestinations(this.client).create(teamId, {
          name: input.name,
          kind: input.kind,
          config: { ...input.config },
          ...(input.secretId && { secretId: input.secretId }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
        }),
      ),
    );
  }
  update(
    teamId: string,
    ref: { id: string; version: number },
    patch: LogDestinationPatch,
  ): Promise<LogDestinationFull> {
    return wrap(async () =>
      toRecord(
        await logDestinations(this.client).update(teamId, ref, {
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.enabled !== undefined && { enabled: patch.enabled }),
          ...(patch.config && { config: { ...patch.config } }),
          ...(patch.secretId !== undefined && { secretId: patch.secretId }),
        }),
      ),
    );
  }
  delete(teamId: string, ref: { id: string; version: number }): Promise<void> {
    return wrap(async () => {
      await logDestinations(this.client).delete(teamId, ref);
    });
  }
}
