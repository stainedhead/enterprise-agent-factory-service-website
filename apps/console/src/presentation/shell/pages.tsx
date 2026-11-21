import { Link } from "react-router";
import type { AppError } from "../../application/errors.js";
import s from "../auth/auth.module.css";
import { Alert, Button } from "../components/index.js";

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className={s.center}>
      <div className={s.panel}>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** Boot-time failure of `GetMe`: a full page, never a blank screen (WEB-US-8.4). */
export function NotRespondingPage({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  return (
    <Centered title="AFS is not responding">
      <Alert
        kind="error"
        title="The console could not reach the service"
        requestId={error.requestId}
      >
        {error.message}
      </Alert>
      <p>
        <Button variant="primary" onClick={onRetry}>
          Retry
        </Button>
      </p>
    </Centered>
  );
}

/** CD-10: signed in but not bound to any team and holding neither service role. */
export function NoAccessPage({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Centered title="No access yet">
      <p className={s.lead}>
        You are signed in, but you have not been added to a team. Ask a team-admin to add you, then
        sign in again.
      </p>
      <Button variant="primary" onClick={onSignOut}>
        Sign out
      </Button>
    </Centered>
  );
}

/** Unknown routes and teams or resources the caller cannot see render the same page (WD-14). */
export function NotFoundPage() {
  return (
    <section aria-labelledby="nf-title">
      <h1 id="nf-title">Page not found</h1>
      <p>The page does not exist, or you do not have access to it.</p>
      <Link to="/">Go to the start page</Link>
    </section>
  );
}
