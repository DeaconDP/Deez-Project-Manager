import { useEffect, useId, useRef, useState } from "react";
import type { GithubVisibilityFilter } from "../types";

interface Props {
  value: GithubVisibilityFilter;
  onChange: (filter: GithubVisibilityFilter) => void;
}

const OPTIONS: { value: GithubVisibilityFilter; label: string }[] = [
  { value: "all", label: "All visibility" },
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
  { value: "unknown", label: "Unknown" },
];

export function VisibilityFilterMenu({ value, onChange }: Props) {
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

  function pick(next: GithubVisibilityFilter) {
    setOpen(false);
    onChange(next);
  }

  const triggerLabel =
    OPTIONS.find((o) => o.value === value)?.label ?? "All visibility";

  return (
    <div className="import-menu" ref={rootRef}>
      <button
        type="button"
        className="btn-secondary import-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        title="Filter by GitHub private / public"
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
          aria-label="GitHub visibility"
        >
          {OPTIONS.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={value === opt.value}
                className={value === opt.value ? "is-selected" : undefined}
                onClick={() => pick(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
