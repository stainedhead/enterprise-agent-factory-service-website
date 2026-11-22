import { label } from "../../../domain/labels.js";
import type { PhaseView } from "../../../domain/status.js";
import { StatusIndicator } from "../../components/index.js";

const STATUS_DOT: Record<string, PhaseView["dot"]> = {
  open: "blue",
  assigned: "blue",
  in_progress: "blue",
  pr_opened: "blue",
  done: "green",
  failed: "red",
  cancelled: "grey",
};
const SLA_DOT: Record<string, PhaseView["dot"]> = {
  on_track: "green",
  due_soon: "amber",
  breached: "red",
  met: "green",
  missed: "red",
};
const REPO_DOT: Record<string, PhaseView["dot"]> = {
  pending: "grey",
  in_progress: "blue",
  pr_opened: "blue",
  merged: "green",
  not_affected: "grey",
  failed: "red",
  skipped: "grey",
};

/** Status of a work order as a dot and a word (PRD §4.2). */
export const WorkOrderStatus = ({ status }: { status: string }) => (
  <StatusIndicator
    view={{ word: label("workOrderStatus", status), dot: STATUS_DOT[status] ?? "grey" }}
  />
);

export const SlaState = ({ state }: { state: string }) => (
  <StatusIndicator view={{ word: label("slaState", state), dot: SLA_DOT[state] ?? "grey" }} />
);

export const RepoStatus = ({ status }: { status: string }) => (
  <StatusIndicator view={{ word: label("repoStatus", status), dot: REPO_DOT[status] ?? "grey" }} />
);
