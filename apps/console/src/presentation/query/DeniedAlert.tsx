import type { AppError } from "../../application/errors.js";
import { Alert } from "../components/Alert.js";

/**
 * The access-denied alert inside a dialog (FR-002): the shell alert sits behind the modal, so the dialog
 * shows the same facts itself, the permission the API names and the request id (WEB-US-8.9).
 */
export function DeniedAlert({ error }: { error: AppError }) {
  const perm = error.requiredPermission;
  return (
    <Alert kind="error" title="Access denied" requestId={error.requestId}>
      {perm ? (
        <>
          You do not have permission to do that. It requires <code>{perm}</code>.
        </>
      ) : (
        "You do not have permission to do that."
      )}
    </Alert>
  );
}
