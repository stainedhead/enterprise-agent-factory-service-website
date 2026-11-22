// The notification channels port (M3-N): `ListNotificationChannels`, `CreateNotificationChannel`,
// `UpdateNotificationChannel`, `DeleteNotificationChannel`, `TestNotificationChannel`, and the report
// schedules that deliver to a channel. A channel never carries a credential: only a secret reference.

export type ChannelKind = "slack" | "email" | "webhook" | "jira" | "eventbridge";

export interface DeliveryRecord {
  readonly healthy: boolean | undefined;
  readonly lastDeliveredAt: string | undefined;
  readonly lastFailureAt: string | undefined;
  readonly lastError: string | undefined;
  readonly lastTestId: string | undefined;
}

export interface ChannelRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly eventTypes: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
  /** The Secrets Manager reference holding the credential, never the credential. */
  readonly secretId: string | undefined;
  readonly delivery: DeliveryRecord;
  readonly version: number;
}

export interface ChannelInput {
  readonly name: string;
  readonly kind: ChannelKind;
  readonly eventTypes: readonly string[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly secretId?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface ChannelPatch {
  readonly name?: string | undefined;
  readonly eventTypes?: readonly string[] | undefined;
  readonly config?: Readonly<Record<string, unknown>> | undefined;
  readonly enabled?: boolean | undefined;
  /** `null` clears the reference. */
  readonly secretId?: string | null | undefined;
}

export interface TestResult {
  readonly testId: string;
  readonly delivered: boolean | undefined;
  readonly pending: boolean;
  readonly error: string | undefined;
}

export interface ScheduleRef {
  readonly id: string;
  readonly name: string;
  readonly channelId: string;
}

export interface NotificationsPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly ChannelRecord[]>;
  get(teamId: string, id: string, signal?: AbortSignal): Promise<ChannelRecord>;
  create(teamId: string, input: ChannelInput): Promise<ChannelRecord>;
  update(
    teamId: string,
    ref: { id: string; version: number },
    patch: ChannelPatch,
  ): Promise<ChannelRecord>;
  delete(teamId: string, ref: { id: string; version: number }): Promise<void>;
  test(teamId: string, id: string): Promise<TestResult>;
  schedules(teamId: string, signal?: AbortSignal): Promise<readonly ScheduleRef[]>;
}
