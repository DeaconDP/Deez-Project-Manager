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
import { PRIORITIES, type Priority } from "../types";

interface Props {
  value: Priority;
  onChange: (priority: Priority) => void;
  /** Accessible name; project name recommended in table cells. */
  label: string;
  /** Dense trigger for table cells. */
  compact?: boolean;
  disabled?: boolean;
  id?: string;
}

type MenuPos = { top: number; left: number; minWidth: number; openUp: boolean };

export function PrioritySelect({
  value,
  onChange,
  label,
  compact = false,
  disabled = false,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, PRIORITIES.indexOf(value)),
  );
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const prio = value.toLowerCase();

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
      const estimatedHeight = compact ? 168 : 196;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      setMenuPos({
        top: openUp ? rect.top - gap : rect.bottom + gap,
        left: rect.left,
        minWidth: Math.max(rect.width, compact ? 88 : 112),
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
  }, [open, compact]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, PRIORITIES.indexOf(value)));

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
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    option?.focus();
  }, [open, activeIndex, menuPos]);

  function pick(priority: Priority) {
    onChange(priority);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveActive(delta: number) {
    setActiveIndex((i) => (i + delta + PRIORITIES.length) % PRIORITIES.length);
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
        setActiveIndex(PRIORITIES.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(PRIORITIES[activeIndex]!);
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
            {PRIORITIES.map((p, index) => {
              const selected = p === value;
              const active = index === activeIndex;
              return (
                <li key={p} role="presentation">
                  <button
                    type="button"
                    role="option"
                    data-index={index}
                    className={`priority-picker-option priority-${p.toLowerCase()}${selected ? " is-selected" : ""}${active ? " is-active" : ""}`}
                    aria-selected={selected}
                    tabIndex={active ? 0 : -1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pick(p)}
                  >
                    <span
                      className="priority-picker-swatch"
                      aria-hidden="true"
                    />
                    <span className="priority-picker-option-label">{p}</span>
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
      className={`priority-picker${compact ? " is-compact" : ""}${open ? " is-open" : ""}`}
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`priority-picker-trigger priority-${prio}`}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="priority-picker-value">{value}</span>
        <span className="priority-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
