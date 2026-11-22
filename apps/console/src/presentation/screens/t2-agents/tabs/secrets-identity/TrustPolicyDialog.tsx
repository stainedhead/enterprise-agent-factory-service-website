import type { RoleLinkRecord } from "../../../../../application/ports/identity.js";
import { trustPolicyText } from "../../../../../application/usecases/identity/IdentityUseCases.js";
import { Alert, Button, CopyButton, Modal } from "../../../../components/index.js";

/** The trust policy (with the generated external ID) for the target account's owner, with *Copy* (WEB-US-31.3). */
export function TrustPolicyDialog({
  link,
  loading,
  error,
  onClose,
}: {
  link: RoleLinkRecord | undefined;
  loading: boolean;
  error: string | undefined;
  onClose: () => void;
}) {
  const text = link ? trustPolicyText(link) : undefined;
  return (
    <Modal
      title="Trust policy for the target role"
      onClose={onClose}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      {link && (
        <p>
          The owner of account {link.accountId} adds this to <code>{link.roleArn}</code>. The link
          reads Pending trust until <em>Verify now</em> succeeds.
        </p>
      )}
      {loading && <p role="status">Loading the trust policy…</p>}
      {error && (
        <Alert kind="error" title="The trust policy could not be loaded">
          {error}
        </Alert>
      )}
      {text && (
        <>
          <section aria-label="Trust policy" style={{ overflow: "auto", maxHeight: 280 }}>
            <pre style={{ margin: 0 }}>{text}</pre>
          </section>
          <CopyButton getText={() => text} label="Copy trust policy" />
        </>
      )}
      {link?.externalId && (
        <p>
          External ID: <code>{link.externalId}</code>
        </p>
      )}
    </Modal>
  );
}
