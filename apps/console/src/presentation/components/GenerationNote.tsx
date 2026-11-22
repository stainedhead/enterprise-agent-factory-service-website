import { CHANGE_NOT_APPLIED, generationNote } from "../../domain/status.js";
import s from "./ui.module.css";

/** "Generation N, observed M" and, while M < N, "Change not applied yet" (WEB-US-9.1). */
export function GenerationNote({ generation, observed }: { generation: number; observed: number }) {
  const n = generationNote(generation, observed);
  return (
    <span className={s.hint}>
      {n.text}
      {n.pending && <strong> · {CHANGE_NOT_APPLIED}</strong>}
    </span>
  );
}
