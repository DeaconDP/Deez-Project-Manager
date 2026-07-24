import { useEffect, useId, useRef, useState } from "react";

export type ListView = "active" | "archive";

interface Props {
  value: ListView;
  archivedCount: number;
  onChange: (view: ListView) => void;
}

export function ListViewMenu({ value, archivedCount, onChange }: Props) {
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

  function pick(view: ListView) {
    setOpen(false);
    onChange(view);
  }

  const archiveLabel =
    archivedCount > 0 ? `Archive (${archivedCount})` : "Archive";
  const triggerLabel = value === "archive" ? archiveLabel : "Active";

  return (
    <div className="import-menu" ref={rootRef}>
      <button
        type="button"
        className="btn-secondary import-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {triggerLabel}
        <span className="import-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul
          id={menuId}
          className="import-menu-list"
          role="menu"
          aria-label="Project list"
        >
          <li role="none">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === "active"}
              className={value === "active" ? "is-selected" : undefined}
              onClick={() => pick("active")}
            >
              Active
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === "archive"}
              className={value === "archive" ? "is-selected" : undefined}
              onClick={() => pick("archive")}
            >
              {archiveLabel}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
