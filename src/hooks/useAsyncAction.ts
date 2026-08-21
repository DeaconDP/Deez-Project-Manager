import { useCallback, useRef, useState } from "react";

export type FeedbackKind = "idle" | "loading" | "success" | "error";

export interface FeedbackState {
  kind: FeedbackKind;
  message: string;
  /** When true, success stays until Dismiss (no auto-clear). */
  persist?: boolean;
}

export type AsyncActionResult =
  | string
  | void
  | { message: string; persist?: boolean };

export function useAsyncAction() {
  const [feedback, setFeedback] = useState<FeedbackState>({
    kind: "idle",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(
    async (
      action: () => Promise<AsyncActionResult>,
      messages?: {
        loading?: string;
        success?: string;
        persistSuccess?: boolean;
      },
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setFeedback({
        kind: "loading",
        message: messages?.loading ?? "Working…",
      });
      try {
        const result = await action();
        if (result === "__cancel__") {
          setFeedback({ kind: "idle", message: "" });
          return;
        }
        const fromObject =
          result != null && typeof result === "object"
            ? result
            : null;
        const message =
          fromObject?.message ||
          (typeof result === "string" ? result : "") ||
          messages?.success ||
          "Done";
        const persist =
          fromObject?.persist === true || messages?.persistSuccess === true;
        setFeedback({
          kind: "success",
          message,
          persist: persist || undefined,
        });
        if (!persist) {
          window.setTimeout(() => {
            setFeedback((f) =>
              f.kind === "success" && !f.persist
                ? { kind: "idle", message: "" }
                : f,
            );
          }, 2500);
        }
      } catch (e) {
        setFeedback({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setFeedback({ kind: "idle", message: "" });
  }, []);

  return { feedback, busy, run, clear, setFeedback };
}
