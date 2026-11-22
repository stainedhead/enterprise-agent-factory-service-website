import { Component, type ReactNode } from "react";
import { isAppError } from "../../application/errors.js";
import { Alert } from "./Alert.js";

interface Props {
  title: string;
  /** A failed query's error: the widget shows it instead of its content. */
  error?: unknown;
  onRetry?: () => void;
  children: ReactNode;
}

interface State {
  thrown: unknown;
}

/**
 * Isolates a dashboard widget (NFR-4): a failing widget (failed query or render error) shows its own
 * error with the request id and *Retry*; the rest of the page keeps working.
 */
export class WidgetBoundary extends Component<Props, State> {
  override state: State = { thrown: undefined };

  static getDerivedStateFromError(e: unknown): State {
    return { thrown: e ?? new Error("Widget failed") };
  }

  override render() {
    const err = this.props.error ?? this.state.thrown;
    if (err === undefined || err === null) return this.props.children;
    return (
      <Alert
        kind="error"
        title={`${this.props.title} could not be loaded`}
        requestId={isAppError(err) ? err.requestId : undefined}
        action={{
          label: "Retry",
          onClick: () => {
            this.setState({ thrown: undefined });
            this.props.onRetry?.();
          },
        }}
      >
        {err instanceof Error ? err.message : "Something went wrong."}
      </Alert>
    );
  }
}
