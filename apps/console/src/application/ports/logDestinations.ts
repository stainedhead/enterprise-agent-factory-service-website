// The log destinations port (M4-L): `ListLogDestinations`, `CreateLogDestination`, `UpdateLogDestination` and
// `DeleteLogDestination`. A destination never carries a credential: only a secret reference.

export type LogKind = "cloudwatch" | "s3" | "otlp" | "splunk_hec" | "datadog";

export interface LogDestinationFull {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly config: Readonly<Record<string, unknown>>;
  /** The Secrets Manager reference holding the credential, never the credential. */
  readonly secretId: string | undefined;
  readonly phase: string;
  /** The `DeliveryHealthy` condition: `True`, `False` or unknown. */
  readonly delivery: "healthy" | "failing" | "unknown";
  readonly deliveryMessage: string | undefined;
  readonly deliveryAt: string | undefined;
  readonly version: number;
}

export interface LogDestinationInput {
  readonly name: string;
  readonly kind: LogKind;
  readonly config: Readonly<Record<string, unknown>>;
  readonly secretId?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface LogDestinationPatch {
  readonly name?: string | undefined;
  readonly config?: Readonly<Record<string, unknown>> | undefined;
  readonly enabled?: boolean | undefined;
  /** `null` clears the reference. */
  readonly secretId?: string | null | undefined;
}

export interface LogDestinationsPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly LogDestinationFull[]>;
  create(teamId: string, input: LogDestinationInput): Promise<LogDestinationFull>;
  update(
    teamId: string,
    ref: { id: string; version: number },
    patch: LogDestinationPatch,
  ): Promise<LogDestinationFull>;
  delete(teamId: string, ref: { id: string; version: number }): Promise<void>;
}
