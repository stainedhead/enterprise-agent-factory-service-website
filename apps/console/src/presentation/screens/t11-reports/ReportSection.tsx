import { useQuery } from "@tanstack/react-query";
import type { ReportKind } from "../../../application/ports/reports.js";
import { can } from "../../../domain/me.js";
import type { FilterKey } from "../../components/report-controls/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { ReportPanel } from "./ReportPanel.js";

export interface ReportSectionConfig {
  readonly title: string;
  readonly kind: ReportKind;
  readonly groupBy: readonly string[];
  readonly defaultGroupBy: readonly string[];
  readonly filters: readonly FilterKey[];
}

/** The team's tag keys, offered as `tag:<key>` group-by choices (WEB-US-19.2). */
export function useTagKeys(teamId: string): string[] {
  const me = useMe();
  const teams = useOptionalService("teams");
  const q = useQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "tags" }),
    queryFn: ({ signal }) =>
      teams ? teams.tags(teamId, signal) : Promise.reject(new Error("no teams")),
    enabled: teams !== undefined && can(me, "tags:read", teamId),
    retry: false,
  });
  return [...new Set((q.data?.tags ?? []).map((t) => t.key))];
}

/** A T11 tab that runs one kind of team report with its controls. */
export function ReportSectionView({ teamId, cfg }: { teamId: string; cfg: ReportSectionConfig }) {
  const me = useMe();
  const tagKeys = useTagKeys(teamId);
  return (
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
    />
  );
}
