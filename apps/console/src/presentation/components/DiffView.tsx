import s from "./ui.module.css";

/** A line diff of two texts (set-based; enough for config revisions). */
export function DiffView({ before, after }: { before: string; after: string }) {
  const a = before.split("\n");
  const b = after.split("\n");
  const inA = new Set(a);
  const inB = new Set(b);
  return (
    <pre className={s.diff}>
      <span className="sr-only">Changes</span>
      {a
        .filter((l) => !inB.has(l))
        .map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional and may repeat
          <div key={`d${i}`} className={s.del}>
            <span className="sr-only">Removed: </span>- {l}
          </div>
        ))}
      {b.map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are positional and may repeat
        <div key={`b${i}`} className={inA.has(l) ? undefined : s.add}>
          {inA.has(l) ? (
            `  ${l}`
          ) : (
            <>
              <span className="sr-only">Added: </span>+ {l}
            </>
          )}
        </div>
      ))}
    </pre>
  );
}
