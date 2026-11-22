import { Alert } from "../components/Alert.js";

/** "This changed since you opened it" with *Reload* (WEB-US-10.1). Edits stay visible. */
export function ConflictAlert({
  onReload,
  requestId,
}: {
  onReload: () => void;
  requestId?: string | undefined;
}) {
  return (
    <Alert
      kind="warning"
      title="This changed since you opened it"
      requestId={requestId}
      action={{ label: "Reload", onClick: onReload }}
    >
      Someone else saved a newer version. Reload to see it next to your edits, then save again.
    </Alert>
  );
}
