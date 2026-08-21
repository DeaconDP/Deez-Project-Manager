import type { FeedbackState } from "../hooks/useAsyncAction";
import { Spinner } from "./Spinner";

interface Props {
  feedback: FeedbackState;
  onDismiss?: () => void;
}

export function ActionFeedback({ feedback, onDismiss }: Props) {
  if (feedback.kind === "idle") return null;
  return (
    <div
      className={`feedback feedback-${feedback.kind}`}
      role="status"
      aria-live="polite"
    >
      <span className="feedback-message">
        {feedback.kind === "loading" && <Spinner size="sm" />}
        {feedback.message}
      </span>
      {(feedback.kind === "error" ||
        (feedback.kind === "success" && feedback.persist)) &&
        onDismiss && (
          <button type="button" className="btn-ghost" onClick={onDismiss}>
            Dismiss
          </button>
        )}
    </div>
  );
}
