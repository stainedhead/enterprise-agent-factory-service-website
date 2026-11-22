import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ReportKind } from "../../../application/ports/reports.js";
import { can } from "../../../domain/me.js";
import { Alert } from "../../components/index.js";
import {
  controlsFromParams,
  type FilterKey,
  type ReportControlsValue,
  toReportQuery,
} from "../../components/report-controls/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { ReportPanel } from "./ReportPanel.js";
import { ScheduleReportButton } from "./schedules/ScheduleReportButton.js";

export interface ReportSectionConfig {
  readonly title: string;
  readonly kind: ReportKind;
  readonly groupBy: readonly string[];
  readonly defaultGroupBy: readonly string[];
  readonly filters: readonly FilterKey[];
}

/**
 * The inline error for a secondary query (tag keys, budget burn): the main content stays, the failure is
 * announced with its request id and a Retry (FR-019). An access denial is the API's answer and is not shown here.
 */
export function SecondaryQueryAlert({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  if (!error) return null;
  const app = isAppError(error) ? error : undefined;
  if (app?.isAccessDenied) return null;
  return (
    <Alert
      kind="error"
      title={title}
      requestId={app?.requestId}
      action={{ label: "Retry", onClick: onRetry }}
    >
      {app?.message ?? "Something went wrong."}
    </Alert>
  );
}

/** The team's tag keys, offered as `tag:<key>` group-by choices (WEB-US-19.2), with the query's failure state. */
export function useTagKeys(teamId: string): {
  keys: string[];
  error: unknown;
  retry: () => void;
} {
  const me = useMe();
  const teams = useOptionalService("teams");
  const q = useQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "tags" }),
    queryFn: ({ signal }) =>
      teams ? teams.tags(teamId, signal) : Promise.reject(new Error("no teams")),
    enabled: teams !== undefined && can(me, "tags:read", teamId),
    retry: false,
  });
  return {
    keys: [...new Set((q.data?.tags ?? []).map((t) => t.key))],
    error: q.error,
    retry: () => void q.refetch(),
  };
}

/** A T11 tab that runs one kind of team report with its controls. */
export function ReportSectionView({ teamId, cfg }: { teamId: string; cfg: ReportSectionConfig }) {
  const me = useMe();
  const { keys: tagKeys, error: tagError, retry: retryTags } = useTagKeys(teamId);
  const [controls, setControls] = useState<ReportControlsValue>(() =>
    controlsFromParams(new URLSearchParams("range=mtd"), {
      range: "mtd",
      groupBy: cfg.defaultGroupBy,
      filters: {},
    }),
  );
  return (
    <>
      <SecondaryQueryAlert
        title="Tag keys could not be loaded"
        error={tagError}
        onRetry={retryTags}
      />
      <ReportPanel
        scope={{ level: "team", teamId }}
        kind={cfg.kind}
        title={cfg.title}
        groupBy={cfg.groupBy}
        defaultGroupBy={cfg.defaultGroupBy}
        filters={cfg.filters}
        tagKeys={cfg.kind === "traffic" || cfg.kind === "activity" ? [] : tagKeys}
        csvDisabledReason={gate(me, "reports:read", teamId)}
        linkTeamId={teamId}
        onControls={setControls}
        actions={
          <ScheduleReportButton
            teamId={teamId}
            kind={cfg.kind}
            title={cfg.title}
            query={toReportQuery(controls)}
          />
        }
      />
    </>
  );
}
