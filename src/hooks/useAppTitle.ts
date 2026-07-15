import { useCallback, useState } from "react";

const STORAGE_KEY = "deez-app-title";
export const DEFAULT_APP_TITLE = "DEEZ PROJECT MANAGER";

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function readStoredTitle(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_APP_TITLE;
    const next = normalizeTitle(raw);
    if (next.length > 0) return next;
  } catch {
    /* ignore */
  }
  return DEFAULT_APP_TITLE;
}

function writeStoredTitle(title: string) {
  try {
    localStorage.setItem(STORAGE_KEY, title);
  } catch {
    /* ignore */
  }
}

export function useAppTitle() {
  const [title, setTitleState] = useState(() =>
    typeof window !== "undefined" ? readStoredTitle() : DEFAULT_APP_TITLE,
  );

  const setTitle = useCallback((raw: string) => {
    const next = normalizeTitle(raw);
    const saved = next.length > 0 ? next : DEFAULT_APP_TITLE;
    setTitleState(saved);
    writeStoredTitle(saved);
    return saved;
  }, []);

  return { title, setTitle };
}
