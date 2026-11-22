import { useState } from "react";
import { Button } from "./Button.js";

/** Copies text to the clipboard and announces it. The text is read at click time, never stored. */
export function CopyButton({
  text,
  label = "Copy",
  getText,
}: {
  text?: string;
  label?: string;
  getText?: () => string;
}) {
  const [done, setDone] = useState(false);
  return (
    <>
      <Button
        variant="link"
        onClick={async () => {
          const value = getText ? getText() : (text ?? "");
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          } catch {
            setDone(false);
          }
        }}
      >
        {label}
      </Button>
      <span role="status" className="sr-only">
        {done ? "Copied" : ""}
      </span>
    </>
  );
}
