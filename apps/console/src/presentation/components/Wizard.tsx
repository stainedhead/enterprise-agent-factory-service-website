import { type ReactNode, useState } from "react";
import { Button } from "./Button.js";
import s from "./ui.module.css";

export interface WizardStep {
  id: string;
  title: string;
  /** *Next* stays disabled until the step is valid. */
  valid: boolean;
  content: ReactNode;
}

/** A wizard: steps, validity-gated *Next*, and a final review step before *Create*. */
export function Wizard({
  steps,
  review,
  submitLabel = "Create",
  onSubmit,
  onCancel,
}: {
  steps: readonly WizardStep[];
  review: ReactNode;
  submitLabel?: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const [i, setI] = useState(0);
  const onReview = i === steps.length;
  const step = steps[i];
  const all = [...steps.map((x) => x.title), "Review"];
  return (
    <section aria-label="Wizard">
      <ol className={s.steps}>
        {all.map((t, n) => (
          <li
            key={t}
            aria-current={n === i ? "step" : undefined}
            className={n === i ? s.stepOn : s.step}
          >
            {n + 1}. {t}
          </li>
        ))}
      </ol>
      <div>{onReview ? review : step?.content}</div>
      <div className={s.actions}>
        <Button onClick={onCancel}>Cancel</Button>
        {i > 0 && <Button onClick={() => setI(i - 1)}>Previous</Button>}
        {onReview ? (
          <Button variant="primary" onClick={onSubmit}>
            {submitLabel}
          </Button>
        ) : (
          <Button variant="primary" disabled={!step?.valid} onClick={() => setI(i + 1)}>
            {i === steps.length - 1 ? "Review" : "Next"}
          </Button>
        )}
      </div>
    </section>
  );
}
