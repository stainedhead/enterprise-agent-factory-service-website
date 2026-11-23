import type { ReactNode } from "react";
import s from "./ui.module.css";

/** The orchestration agent's diamond mark. Decorative: the text next to it carries the meaning. */
export function OrchestrationMark() {
  return (
    <span className={s.orchMark} aria-hidden="true">
      ◆
    </span>
  );
}

/** The purple-accented card that sets the orchestration agent apart from worker agents (OR-D11). */
export function OrchestrationCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={s.orchCard} aria-label={label}>
      {children}
    </section>
  );
}
