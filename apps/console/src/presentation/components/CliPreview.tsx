import { type CliCommand, renderCli } from "../../domain/cli.js";
import { CopyButton } from "./CopyButton.js";
import s from "./ui.module.css";

/** Shows the equivalent `afs` command for a form (scriptable, WEB-6). */
export function CliPreview({ command }: { command: CliCommand }) {
  const text = renderCli(command);
  return (
    <div className={s.cli}>
      <span className="sr-only">Equivalent CLI command</span>
      <code>{text}</code>
      <CopyButton text={text} label="Copy command" />
    </div>
  );
}
