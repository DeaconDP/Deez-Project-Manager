import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "./Spinner";

interface Props {
  roots: string[];
  busy: boolean;
  syncing: boolean;
  disabled?: boolean;
  onSyncAll: () => void;
  onSync: (path: string) => void;
  onAddRoot: () => void;
  onRemoveRoot: (path: string) => void;
}

function folderLabel(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function SyncMenu({
  roots,
  busy,
  syncing,
  disabled,
  onSyncAll,
  onSync,
  onAddRoot,
  onRemoveRoot,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (syncing) setOpen(false);
  }, [syncing]);

  return (
    <div className="import-menu sync-menu" ref={rootRef}>
      <button
        type="button"
        className="btn-secondary import-menu-trigger"
        disabled={disabled || busy}
        aria-busy={syncing}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {syncing ? (
          <span className="btn-busy-label">
            <Spinner size="sm" />
            Syncing…
          </span>
        ) : (
          <>
            Sync
            <span className="import-menu-caret" aria-hidden>
              ▾
            </span>
          </>
        )}
      </button>
      {open && (
        <ul
          id={menuId}
          className="import-menu-list sync-menu-list"
          role="menu"
          aria-label="Sync parent folders"
        >
          {roots.length === 0 ? (
            <li className="sync-menu-empty" role="presentation">
              No parent folders yet. Add one to scan its child folders.
            </li>
          ) : (
            <>
              <li role="none" className="sync-menu-all">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSyncAll();
                  }}
                >
                  Sync all
                </button>
              </li>
              {roots.map((path) => (
                <li key={path} role="none" className="sync-menu-row">
                  <button
                    type="button"
                    role="menuitem"
                    className="sync-menu-sync"
                    title={path}
                    onClick={() => {
                      setOpen(false);
                      onSync(path);
                    }}
                  >
                    {folderLabel(path)}
                  </button>
                  <button
                    type="button"
                    className="sync-menu-remove"
                    aria-label={`Remove ${folderLabel(path)} from sync list`}
                    title="Remove from sync list"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRoot(path);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </>
          )}
          <li role="none" className="sync-menu-footer">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAddRoot();
              }}
            >
              Add parent folder…
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

