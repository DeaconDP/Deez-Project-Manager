import { useCallback, useState } from "react";

export type FeedbackKind = "idle" | "loading" | "success" | "error";

export interface FeedbackState {
  kind: FeedbackKind;
  message: string;
}

export function useAsyncAction() {
  const [feedback, setFeedback] = useState<FeedbackState>({
    kind: "idle",
    message: "",
  });
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (
      action: () => Promise<string | void>,
      messages?: { loading?: string; success?: string },
    ) => {
      if (busy) return;
      setBusy(true);
      setFeedback({
        kind: "loading",
        message: messages?.loading ?? "Working…",
      });
      try {
        const resultMessage = await action();
        if (resultMessage === "__cancel__") {
          setFeedback({ kind: "idle", message: "" });
          return;
        }
        setFeedback({
          kind: "success",
          message:
            resultMessage ||
            messages?.success ||
            "Done",
        });
        window.setTimeout(() => {
          setFeedback((f) =>
            f.kind === "success" ? { kind: "idle", message: "" } : f,
          );
        }, 2500);
      } catch (e) {
        setFeedback({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const clear = useCallback(() => {
    setFeedback({ kind: "idle", message: "" });
  }, []);

  return { feedback, busy, run, clear, setFeedback };
}
