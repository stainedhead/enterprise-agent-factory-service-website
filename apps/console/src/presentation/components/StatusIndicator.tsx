import { type PhaseView, type StatusLike, statusView } from "../../domain/status.js";
import s from "./ui.module.css";

/** A dot plus a word, never colour alone (PRD §4.2). */
export function StatusIndicator({ view, status }: { view?: PhaseView; status?: StatusLike }) {
  const v = view ?? statusView(status ?? { phase: "" });
  return (
    <span className={`${s.status} ${s[v.dot]}`}>
      <span className={s.dot} aria-hidden="true" />
      <span>{v.word}</span>
    </span>
  );
}
