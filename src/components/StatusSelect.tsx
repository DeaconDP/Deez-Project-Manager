import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  normalizeStatus,
  STATUSES,
  statusClassSlug,
  type Status,
} from "../types";
import { StatusIcon } from "./FieldIcons";

interface Props {
  value: string;
  onChange: (status: Status) => void;
  /** Accessible name; project name recommended in table cells. */
  label: string;
  /** Dense trigger for table cells. */
  compact?: boolean;
  /** Icon-only trigger (phone table cells). */
  iconOnly?: boolean;
  disabled?: boolean;
  id?: string;
}

type MenuPos = { top: number; left: number; minWidth: number; openUp: boolean };

export function StatusSelect({
  value,
  onChange,
  label,
  compact = false,
  iconOnly = false,
  disabled = false,
  id,
}: Props) {
  const selected = normalizeStatus(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, STATUSES.indexOf(selected)),
  );
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const slug = statusClassSlug(selected);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }

    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 5;
      const estimatedHeight = compact ? 110 : 128;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      setMenuPos({
        top: openUp ? rect.top - gap : rect.bottom + gap,
        left: rect.left,
        minWidth: Math.max(rect.width, iconOnly ? 120 : compact ? 88 : 112),
        openUp,
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, compact, iconOnly]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, STATUSES.indexOf(selected)));

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    option?.focus();
  }, [open, activeIndex, menuPos]);

  function pick(status: Status) {
    onChange(status);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveActive(delta: number) {
    setActiveIndex((i) => (i + delta + STATUSES.length) % STATUSES.length);
  }

  function onTriggerKeyDown(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(STATUSES.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(STATUSES[activeIndex]!);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  const listStyle: CSSProperties | undefined = menuPos
    ? {
        top: menuPos.openUp ? undefined : menuPos.top,
        bottom: menuPos.openUp
          ? window.innerHeight - menuPos.top
          : undefined,
        left: menuPos.left,
        minWidth: menuPos.minWidth,
      }
    : undefined;

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            className={`priority-picker-list${compact ? " is-compact" : ""}`}
            role="listbox"
            aria-label={label}
            style={listStyle}
            onKeyDown={onListKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {STATUSES.map((s, index) => {
              const isSelected = s === selected;
              const active = index === activeIndex;
              return (
                <li key={s} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-index={index}
                    className={`priority-picker-option status-${statusClassSlug(s)}${isSelected ? " is-selected" : ""}${active ? " is-active" : ""}`}
                    aria-selected={isSelected}
                    tabIndex={active ? 0 : -1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(s)}
                  >
                    <span
                      className="priority-picker-swatch"
                      aria-hidden="true"
                    />
                    <span className="priority-picker-option-label">{s}</span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      className={`priority-picker${compact ? " is-compact" : ""}${iconOnly ? " is-icon-only" : ""}${open ? " is-open" : ""}`}
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`priority-picker-trigger status-${slug}`}
        disabled={disabled}
        title={selected}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        {iconOnly ? (
          <StatusIcon status={selected} />
        ) : (
          <>
            <span className="priority-picker-value">{selected}</span>
            <span className="priority-picker-caret" aria-hidden="true">
              ▾
            </span>
          </>
        )}
      </button>
      {menu}
    </div>
  );
}
