import { useEffect, useId, useRef, useState } from "react";
import { Spinner } from "./Spinner";

export type ImportKind = "hub" | "vcc" | "github";

interface Props {
  busy: boolean;
  busyKind: ImportKind | null;
  disabled?: boolean;
  onImportHub: () => void;
  onImportVcc: () => void;
  onImportGithub: () => void;
}

export function ImportMenu({
  busy,
  busyKind,
  disabled,
  onImportHub,
  onImportVcc,
  onImportGithub,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const importing = busy && busyKind !== null;

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
    if (importing) setOpen(false);
  }, [importing]);

  function pick(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <div className="import-menu" ref={rootRef}>
      <button
        type="button"
        className="btn-secondary import-menu-trigger"
        disabled={disabled || busy}
        aria-busy={importing}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {importing ? (
          <span className="btn-busy-label">
            <Spinner size="sm" />
            Importing…
          </span>
        ) : (
          <>
            Import
            <span className="import-menu-caret" aria-hidden>
              ▾
            </span>
          </>
        )}
      </button>
      {open && (
        <ul
          id={menuId}
          className="import-menu-list"
          role="menu"
          aria-label="Import projects"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onImportHub)}
            >
              Unity Hub
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onImportVcc)}
            >
              VCC
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onImportGithub)}
            >
              GitHub
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
