/** True when running inside the Tauri webview (not a phone/browser PWA). */
export function isTauri(): boolean {
  return !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
}

const PEER_BASE_KEY = "deez-remote-base";
const TOKEN_KEY = "deez-remote-token";

/** Active remote origin when browsing another node (or empty = same origin). */
export function getRemoteBase(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(PEER_BASE_KEY)?.trim() ?? "";
  if (!stored) return "";
  return stored.replace(/\/$/, "");
}

export function setRemoteBase(base: string | null): void {
  if (!base || !base.trim()) {
    window.localStorage.removeItem(PEER_BASE_KEY);
    return;
  }
  window.localStorage.setItem(PEER_BASE_KEY, base.trim().replace(/\/$/, ""));
}

export function getRemoteToken(): string {
  return window.localStorage.getItem(TOKEN_KEY)?.trim() ?? "";
}

export function setRemoteToken(token: string | null): void {
  if (!token || !token.trim()) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token.trim());
}

function apiUrl(path: string): string {
  const base = getRemoteBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export async function remoteFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getRemoteToken();
  if (token) headers.set("X-Deez-Token", token);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(apiUrl(path), { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `REMOTE-${res.status}: ${text || res.statusText || "request failed"}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function remoteUnsupported(action: string): never {
  throw new Error(
    `REMOTE-001: “${action}” needs the desktop app on this machine — not available in the phone PWA.`,
  );
}
