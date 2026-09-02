import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  getRemoteBase,
  isTauri,
  rememberBrowserToken,
  remoteGetInfo,
  remoteQrSvg,
  remoteSaveSettings,
  setRemoteBase,
  type RemoteInfoDto,
} from "../../api";

import { Toggle } from "./Toggle";

const isDev = import.meta.env.DEV;
const DEFAULT_PORT = 5197;

export function SettingsPanel() {
  const desktop = isTauri();
  const [openOnStartup, setOpenOnStartup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [remote, setRemote] = useState<RemoteInfoDto | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [peersDraft, setPeersDraft] = useState("");
  const [portDraft, setPortDraft] = useState(DEFAULT_PORT);
  const [peerSwitch, setPeerSwitch] = useState(getRemoteBase());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (desktop) {
          if (isDev) {
            const on = await isEnabled();
            if (on) await disable();
            if (!cancelled) {
              setOpenOnStartup(false);
              setFeedback(
                "Open on startup is release-only — enable it after launching a release build.",
              );
            }
          } else {
            const on = await isEnabled();
            if (!cancelled) setOpenOnStartup(on);
          }
        }

        const info = await remoteGetInfo();
        if (cancelled) return;
        setRemote(info);
        setPortDraft(info.settings.port || DEFAULT_PORT);
        setTokenDraft(info.settings.token ?? "");
        setPeersDraft(info.settings.peers.join("\n"));
        if (desktop && info.settings.enabled && info.url) {
          try {
            setQrSvg(await remoteQrSvg());
          } catch {
            setQrSvg(null);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  async function setOpenOnStartupPreference(next: boolean) {
    if (busy || isDev || !desktop) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      if (next) await enable();
      else await disable();
      setOpenOnStartup(next);
      setFeedback(next ? "Will open when you sign in." : "Won’t open on startup.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function parsePeers(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  async function applyRemote(patch: {
    enabled?: boolean;
    port?: number;
    token?: string | null;
    peers?: string[];
  }) {
    if (!desktop || !remote) return;
    setRemoteBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const settings = {
        enabled: patch.enabled ?? remote.settings.enabled,
        port: patch.port ?? portDraft,
        token:
          patch.token !== undefined ? patch.token : tokenDraft.trim() || null,
        peers: patch.peers ?? parsePeers(peersDraft),
      };
      const info = await remoteSaveSettings(settings);
      setRemote(info);
      setPortDraft(info.settings.port);
      setTokenDraft(info.settings.token ?? "");
      setPeersDraft(info.settings.peers.join("\n"));
      if (info.settings.enabled && info.url) {
        try {
          setQrSvg(await remoteQrSvg());
        } catch {
          setQrSvg(null);
        }
        setFeedback(
          info.status.running
            ? `Remote open at ${info.url}`
            : (info.status.lastError ??
              "Remote enabled — waiting for Tailscale."),
        );
      } else {
        setQrSvg(null);
        setFeedback("Remote access off.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoteBusy(false);
    }
  }

  async function copyUrl() {
    if (!remote?.url) return;
    setRemoteBusy(true);
    setError(null);
    try {
      await navigator.clipboard.writeText(remote.url);
      setFeedback("URL copied.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoteBusy(false);
    }
  }

  function switchPeer(raw: string) {
    const value = raw.trim().replace(/\/$/, "");
    if (!value) {
      setRemoteBase(null);
      setPeerSwitch("");
      setFeedback("Using this page’s host.");
      return;
    }
    const url = value.includes("://") ? value : `http://${value}`;
    setRemoteBase(url);
    setPeerSwitch(url);
    rememberBrowserToken(tokenDraft.trim() || null);
    setFeedback(`Opening ${url}…`);
    window.location.assign(url);
  }

  const ts = remote?.tailscale;

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <header className="panel__head">
        <h2 id="settings-title">Settings</h2>
        <p className="panel__desc">
          {desktop
            ? "App preferences for this computer"
            : "Phone / PWA view of a Tailscale node"}
        </p>
      </header>

      {error ? (
        <p className="status status--error" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p className="status status--ok" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="settings-list">
        {desktop ? (
          <Toggle
            id="open-on-startup"
            label="Open on startup"
            description={
              isDev
                ? "Disabled in development — enable it from a release build"
                : "Launch Deez Project Manager when you sign in"
            }
            checked={openOnStartup}
            disabled={loading || isDev}
            busy={busy}
            onChange={(v) => void setOpenOnStartupPreference(v)}
          />
        ) : null}

        <div className="settings-block">
          <h3 className="settings-block__title">Remote access</h3>
          <p className="settings-block__desc">
            Tailscale-only PWA URL for this node. Not public internet.
          </p>

          {desktop ? (
            <Toggle
              id="remote-enabled"
              label="Serve on Tailscale"
              description={
                ts?.ipv4
                  ? `Bind ${ts.ipv4}:${portDraft}${ts.dnsName ? ` · ${ts.dnsName}` : ""}`
                  : "Needs Tailscale running on this machine"
              }
              checked={!!remote?.settings.enabled}
              disabled={loading || remoteBusy || !ts?.ipv4}
              busy={remoteBusy}
              onChange={(v) => void applyRemote({ enabled: v })}
            />
          ) : null}

          <label className="settings-field">
            <span className="settings-field__label">Port</span>
            <input
              className="settings-field__input"
              type="number"
              min={1024}
              max={65535}
              value={portDraft}
              disabled={!desktop || remoteBusy}
              onChange={(e) =>
                setPortDraft(Number(e.target.value) || DEFAULT_PORT)
              }
              onBlur={() => {
                if (desktop && remote?.settings.enabled) {
                  void applyRemote({ port: portDraft });
                }
              }}
            />
          </label>

          <label className="settings-field">
            <span className="settings-field__label">Shared secret (optional)</span>
            <input
              className="settings-field__input"
              type="password"
              autoComplete="off"
              placeholder="Empty = tailnet ACL only"
              value={tokenDraft}
              disabled={remoteBusy}
              onChange={(e) => setTokenDraft(e.target.value)}
              onBlur={() => {
                rememberBrowserToken(tokenDraft.trim() || null);
                if (desktop && remote) {
                  void applyRemote({ token: tokenDraft.trim() || null });
                }
              }}
            />
          </label>

          {remote?.url ? (
            <div className="settings-url-row">
              <code className="settings-url">{remote.url}</code>
              {desktop ? (
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={remoteBusy}
                  aria-busy={remoteBusy || undefined}
                  onClick={() => void copyUrl()}
                >
                  Copy
                </button>
              ) : null}
            </div>
          ) : (
            <p className="settings-muted">
              {ts?.installed
                ? "No Tailscale IPv4 yet — check the Tailscale app."
                : "Install Tailscale and join your tailnet to get a phone URL."}
            </p>
          )}

          {qrSvg ? (
            <div
              className="settings-qr"
              aria-label="QR code for phone URL"
              // QR SVG is generated locally by the host.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : null}

          <label className="settings-field">
            <span className="settings-field__label">Peer nodes (MagicDNS)</span>
            <textarea
              className="settings-field__input settings-field__input--area"
              rows={3}
              placeholder={"other-pc.tailnet.ts.net\nada.tailnet.ts.net:5197"}
              value={peersDraft}
              disabled={remoteBusy}
              onChange={(e) => setPeersDraft(e.target.value)}
              onBlur={() => {
                if (desktop && remote) void applyRemote({});
              }}
            />
          </label>

          {remote?.settings.peers.length || peerSwitch ? (
            <div className="settings-peers">
              <span className="settings-field__label">Switch node</span>
              <div className="settings-peers__row">
                {remote?.settings.peers.map((peer) => (
                  <button
                    key={peer}
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => switchPeer(peer)}
                  >
                    {peer}
                  </button>
                ))}
                {!desktop ? (
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => switchPeer("")}
                  >
                    This host
                  </button>
                ) : null}
              </div>
              <input
                className="settings-field__input"
                type="text"
                placeholder="http://host:5197"
                value={peerSwitch}
                onChange={(e) => setPeerSwitch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") switchPeer(peerSwitch);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
