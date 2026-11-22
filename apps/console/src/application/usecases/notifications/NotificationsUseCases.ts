import { AppError } from "../../errors.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  ChannelInput,
  ChannelPatch,
  ChannelRecord,
  NotificationsPort,
  ScheduleRef,
  TestResult,
} from "../../ports/notifications.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** The settings each kind needs, by `config` key; a credential is never one of them (use a secret). */
export const KIND_FIELDS: Readonly<
  Record<string, readonly { key: string; label: string; hint?: string }[]>
> = {
  slack: [{ key: "channel", label: "Slack channel", hint: "For example #agent-alerts" }],
  email: [{ key: "to", label: "Recipients", hint: "Comma-separated addresses" }],
  webhook: [{ key: "url", label: "Webhook URL", hint: "An https:// address" }],
  jira: [
    { key: "site", label: "Jira site", hint: "For example example.atlassian.net" },
    { key: "project", label: "Project key", hint: "For example OPS" },
  ],
  eventbridge: [{ key: "eventBusArn", label: "Event bus ARN" }],
};

/** Kinds that must name a secret holding their credential. */
export const NEEDS_SECRET: ReadonlySet<string> = new Set(["slack", "webhook", "jira"]);

export function parseEvents(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((e) => e.trim())
        .filter(Boolean),
    ),
  ];
}

function check(i: ChannelInput): AppError | undefined {
  if (!i.name.trim()) return invalid("name", "Enter a name");
  if (i.eventTypes.length === 0)
    return invalid("eventTypes", "Choose at least one event, for example budget.*");
  for (const f of KIND_FIELDS[i.kind] ?? [])
    if (!String(i.config[f.key] ?? "").trim()) return invalid(f.key, `Enter the ${f.label}`);
  if (i.kind === "webhook" && !String(i.config.url).startsWith("https://"))
    return invalid("url", "Use an https:// address");
  if (NEEDS_SECRET.has(i.kind) && !i.secretId)
    return invalid("secretId", "Choose the secret that holds the credential");
  return undefined;
}

/** What a channel shows as its delivery: failing channels carry their error (WEB-US-34.4). */
export function deliveryWord(c: ChannelRecord): "Failing" | "Delivering" | "Not yet used" {
  if (c.delivery.healthy === false || c.delivery.lastError) return "Failing";
  return c.delivery.lastDeliveredAt ? "Delivering" : "Not yet used";
}

const POLL_MS = 2000;
const POLL_MAX = 15;

/** Notification channels for T14 (M3-N). The API decides access. */
export class NotificationsUseCases {
  constructor(
    private readonly port: NotificationsPort,
    private readonly clock: Pick<ClockPort, "setTimeout">,
  ) {}

  list(teamId: string, signal?: AbortSignal) {
    return this.port.list(teamId, signal);
  }
  create(teamId: string, input: ChannelInput) {
    const bad = check(input);
    return bad ? Promise.reject(bad) : this.port.create(teamId, input);
  }
  update(teamId: string, channel: ChannelRecord, patch: ChannelPatch) {
    if (patch.name !== undefined && !patch.name.trim())
      return Promise.reject(invalid("name", "Enter a name"));
    if (patch.eventTypes && patch.eventTypes.length === 0)
      return Promise.reject(invalid("eventTypes", "Choose at least one event"));
    return this.port.update(teamId, { id: channel.id, version: channel.version }, patch);
  }
  /** The report schedules that deliver to this channel; deleting it would stop them (WEB-US-34.3). */
  async schedulesUsing(teamId: string, channelId: string): Promise<readonly ScheduleRef[]> {
    return (await this.port.schedules(teamId)).filter((s) => s.channelId === channelId);
  }
  delete(teamId: string, channel: ChannelRecord) {
    return this.port.delete(teamId, { id: channel.id, version: channel.version });
  }

  /**
   * *Send test* (CD-3): a `200` is the result; a `202 pending` is followed by reading the channel until its
   * delivery status reports that test, then the result is delivered or the error.
   */
  async sendTest(teamId: string, channelId: string): Promise<TestResult> {
    const first = await this.port.test(teamId, channelId);
    if (!first.pending) return first;
    for (let n = 0; n < POLL_MAX; n += 1) {
      await new Promise<void>((r) => this.clock.setTimeout(r, POLL_MS));
      const c = await this.port.get(teamId, channelId);
      if (c.delivery.lastTestId === first.testId)
        return {
          testId: first.testId,
          pending: false,
          delivered: c.delivery.healthy !== false && !c.delivery.lastError,
          error: c.delivery.lastError,
        };
    }
    return { ...first, pending: true };
  }
}
