import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  type Modifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  githubStatusLabel,
  normalizeCategory,
  normalizeStatus,
  statusClassSlug,
  type Category,
  type Priority,
  type Project,
  type Status,
} from "../types";
import type { UiLayout } from "../hooks/useUiZoom";
import { CategorySelect } from "./CategorySelect";
import {
  CategoryHeaderIcon,
  CategoryIcon,
  GithubHeaderIcon,
  GithubStatusIcon,
  PlatformHeaderIcon,
  PlatformIcon,
  PriorityHeaderIcon,
  PriorityIcon,
  StatusHeaderIcon,
  StatusIcon,
} from "./FieldIcons";
import { PrioritySelect } from "./PrioritySelect";
import { StatusSelect } from "./StatusSelect";
import { Spinner } from "./Spinner";

/** Cheap: lock X so list reorders stay vertical without @dnd-kit/modifiers. */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

/**
 * Sibling FLIP while dragging. Longer + gentler ease so interrupted
 * collision updates don’t look like hasty flits.
 */
const SORTABLE_TRANSITION = {
  duration: 420,
  easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
} as const;

const DROP_ANIMATION: DropAnimation = {
  duration: 320,
  easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0" } },
  }),
};

export type TableSortKey =
  | "custom"
  | "favorite"
  | "name"
  | "priority"
  | "platform"
  | "status"
  | "category"
  | "github";

export type TableSortState = {
  key: TableSortKey;
  dir: "asc" | "desc";
};

const SORT_STORAGE_KEY = "deez-table-sort";
const DEFAULT_SORT: TableSortState = { key: "custom", dir: "asc" };

function readStoredSort(): TableSortState {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw == null) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as TableSortState;
    if (parsed?.key && (parsed.dir === "asc" || parsed.dir === "desc")) {
      return { key: parsed.key, dir: parsed.dir };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SORT;
}

function writeStoredSort(sort: TableSortState) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {
    /* ignore */
  }
}

const PRIORITY_RANK: Record<Priority, number> = {
  Crit: 0,
  High: 1,
  Med: 2,
  Low: 3,
  Default: 4,
};

function compareProjects(
  a: Project,
  b: Project,
  key: Exclude<TableSortKey, "custom">,
  dir: "asc" | "desc",
): number {
  let cmp = 0;
  switch (key) {
    case "favorite":
      // Asc = starred first
      cmp = Number(b.favorite) - Number(a.favorite);
      break;
    case "name":
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      break;
    case "priority":
      cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      break;
    case "platform":
      cmp = a.platform.localeCompare(b.platform);
      break;
    case "status":
      cmp = normalizeStatus(a.status).localeCompare(normalizeStatus(b.status));
      break;
    case "category":
      cmp = a.category.localeCompare(b.category);
      break;
    case "github":
      cmp = githubStatusLabel(a.githubStatus).localeCompare(
        githubStatusLabel(b.githubStatus),
      );
      break;
  }
  if (cmp === 0) cmp = a.sortIndex - b.sortIndex;
  return dir === "asc" ? cmp : -cmp;
}

function TrashIcon() {
  return (
    <svg
      className="trash-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M3.5 4.5h9M6.5 4.5V3.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M5.5 4.5v8a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-8"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 7v4M9 7v4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg
      className="grip-icon"
      width="12"
      height="16"
      viewBox="0 0 12 16"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="3.5" cy="3" r="1.25" />
      <circle cx="8.5" cy="3" r="1.25" />
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8.5" cy="8" r="1.25" />
      <circle cx="3.5" cy="13" r="1.25" />
      <circle cx="8.5" cy="13" r="1.25" />
    </svg>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const common = {
    className: "tool-icon",
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  switch (tool) {
    case "Cursor":
      return (
        <svg {...common}>
          <path
            d="M3 2.5 11 7 3 11.5V2.5Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Claude":
      return (
        <svg {...common}>
          <path
            d="M7 2.25 11.25 7 7 11.75 2.75 7 7 2.25Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "Codex":
      return (
        <svg {...common}>
          <rect
            x="2.5"
            y="2.5"
            width="9"
            height="9"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.25"
          />
          <path
            d="M5 7h4M7 5v4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "OpenCode":
      return (
        <svg {...common}>
          <path
            d="M3.25 4.25h7.5v5.5H3.25V4.25Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M5.25 6.5 6.75 8l2-2.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle
            cx="7"
            cy="7"
            r="4.25"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </svg>
      );
  }
}

interface RowProps {
  project: Project;
  busyId: string | null;
  busyAction: "open" | "reveal" | "run" | null;
  archivedView: boolean;
  /** First-paint enter only — not on header sort reorder. */
  animateEnter?: boolean;
  index?: number;
  iconOnly?: boolean;
  onToggleFavorite: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
  onStatusChange: (id: string, status: Status) => void;
  onCategoryChange: (id: string, category: Category) => void;
  onOpenBoard?: (project: Project) => void;
  onOpen: (project: Project) => void;
  onRun: (project: Project) => void;
  onReveal: (project: Project) => void;
  onEdit: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
}

type OverflowMenuPos = {
  top: number;
  left: number;
  openUp: boolean;
};

function RowOverflowMenu({
  project,
  rowBusy,
  openBusy,
  revealBusy,
  archivedView,
  compact,
  onOpen,
  onReveal,
  onEdit,
  onArchive,
  onRestore,
}: {
  project: Project;
  rowBusy: boolean;
  openBusy: boolean;
  revealBusy: boolean;
  archivedView: boolean;
  compact?: boolean;
  onOpen: (project: Project) => void;
  onReveal: (project: Project) => void;
  onEdit: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<OverflowMenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();
  const btnClass = compact ? "btn-sm" : undefined;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }

    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const estimatedHeight = 180;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      const width = 160;
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      setMenuPos({
        top: openUp ? rect.top - gap : rect.bottom + gap,
        left,
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
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
  }, [open]);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  const listStyle: CSSProperties | undefined = menuPos
    ? {
        top: menuPos.openUp ? undefined : menuPos.top,
        bottom: menuPos.openUp
          ? window.innerHeight - menuPos.top
          : undefined,
        left: menuPos.left,
      }
    : undefined;

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={listRef}
            id={menuId}
            className="row-overflow-list"
            role="menu"
            aria-label={`Actions for ${project.name}`}
            style={listStyle}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={rowBusy || !project.localPath}
                aria-busy={openBusy}
                onClick={() => run(() => onOpen(project))}
              >
                {openBusy ? "Opening…" : "Open"}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={rowBusy || !project.localPath}
                aria-busy={revealBusy}
                onClick={() => run(() => onReveal(project))}
              >
                {revealBusy ? "Revealing…" : "Reveal in file manager"}
              </button>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => run(() => onEdit(project))}
              >
                Edit
              </button>
            </li>
            {archivedView ? (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(() => onRestore(project))}
                >
                  Restore
                </button>
              </li>
            ) : (
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="danger-item"
                  onClick={() => run(() => onArchive(project))}
                >
                  <TrashIcon />
                  Archive
                </button>
              </li>
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className="row-overflow" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`btn-secondary${btnClass ? ` ${btnClass}` : ""} row-overflow-trigger`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={`More actions for ${project.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        ···
      </button>
      {menu}
    </div>
  );
}

function ProjectActions({
  project,
  busyId,
  busyAction,
  archivedView,
  compact,
  onOpen,
  onRun,
  onReveal,
  onEdit,
  onArchive,
  onRestore,
}: Omit<
  RowProps,
  | "onToggleFavorite"
  | "onPriorityChange"
  | "onStatusChange"
  | "onCategoryChange"
  | "index"
  | "animateEnter"
> & {
  compact?: boolean;
}) {
  const rowBusy = busyId === project.id;
  const openBusy = rowBusy && busyAction === "open";
  const runBusy = rowBusy && busyAction === "run";
  const revealBusy = rowBusy && busyAction === "reveal";
  const btnClass = compact ? "btn-sm" : undefined;
  const canRun = !!project.localPath && project.hasRunScript;

  return (
    <div className="project-actions">
      {canRun ? (
        <button
          type="button"
          className={`btn-primary project-action-run${btnClass ? ` ${btnClass}` : ""}`}
          disabled={rowBusy || !project.localPath}
          aria-busy={runBusy}
          onClick={() => onRun(project)}
          title="Launch run.bat / run.command"
        >
          {runBusy ? (
            <span className="btn-busy-label">
              <Spinner size="sm" />
              Starting…
            </span>
          ) : (
            "Run"
          )}
        </button>
      ) : (
        <button
          type="button"
          className={`btn-primary project-action-open${btnClass ? ` ${btnClass}` : ""}`}
          disabled={rowBusy || !project.localPath}
          aria-busy={openBusy}
          onClick={() => onOpen(project)}
          title={
            project.localPath ? "Open project" : "Set a local path to open"
          }
        >
          {openBusy ? (
            <span className="btn-busy-label">
              <Spinner size="sm" />
              Opening…
            </span>
          ) : (
            "Open"
          )}
        </button>
      )}
      <RowOverflowMenu
        project={project}
        rowBusy={rowBusy}
        openBusy={!!openBusy}
        revealBusy={!!revealBusy}
        archivedView={archivedView}
        compact={compact}
        onOpen={onOpen}
        onReveal={onReveal}
        onEdit={onEdit}
        onArchive={onArchive}
        onRestore={onRestore}
      />
    </div>
  );
}

function Cell({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="cell" className={className}>
      {children}
    </div>
  );
}

/** Shorten deep Windows/Unix paths; keep owner/repo and short paths intact. */
function shortenPath(path: string, maxParts = 2): string {
  const normalized = path.replace(/\//g, "\\");
  const parts = normalized.split("\\").filter(Boolean);
  if (parts.length <= maxParts + 1) return path;
  return `…\\${parts.slice(-maxParts).join("\\")}`;
}

function EmptyValue() {
  return (
    <span className="cell-empty" aria-hidden="true">
      —
    </span>
  );
}

function NamePathLine({ project }: { project: Project }) {
  if (project.localPath) {
    return (
      <span className="name-path" title={project.localPath}>
        {shortenPath(project.localPath)}
      </span>
    );
  }
  if (project.githubRepo) {
    return (
      <span className="name-path name-path-repo" title={project.githubRepo}>
        {project.githubRepo}
      </span>
    );
  }
  return <span className="name-path name-path-missing">No local path</span>;
}

function ProjectDataCells({
  project,
  drag,
  fav,
  priority,
  status,
  category,
  actions,
  onOpenBoard,
  iconOnly = false,
}: {
  project: Project;
  drag: ReactNode;
  fav: ReactNode;
  priority: ReactNode;
  status: ReactNode;
  category: ReactNode;
  actions: ReactNode;
  onOpenBoard?: (project: Project) => void;
  iconOnly?: boolean;
}) {
  const ghLabel = githubStatusLabel(project.githubStatus);

  return (
    <>
      <Cell className="col-drag">{drag}</Cell>
      <Cell className="col-fav">{fav}</Cell>
      <Cell className="col-platform">
        <div className="platform-cell">
          <span
            className="platform-icon-row"
            title={project.platform}
            aria-label={project.platform}
          >
            <PlatformIcon platform={project.platform} />
            {iconOnly ? null : (
              <span className="platform-label">{project.platform}</span>
            )}
          </span>
          {(project.tools?.length ?? 0) > 0 ? (
            <span className="tool-icon-row" aria-label={project.tools.join(", ")}>
              {project.tools.map((tool) => (
                <span key={tool} className="tool-badge" title={tool}>
                  <ToolIcon tool={tool} />
                </span>
              ))}
            </span>
          ) : null}
          {!iconOnly && project.unityVersion ? (
            <span className="platform-sub" title={`Unity ${project.unityVersion}`}>
              {project.unityVersion}
            </span>
          ) : null}
        </div>
      </Cell>
      <Cell className="col-name">
        <div className="name-cell">
          {onOpenBoard ? (
            <button
              type="button"
              className="name-primary name-board-link"
              onClick={() => onOpenBoard(project)}
            >
              {project.name}
            </button>
          ) : (
            <span className="name-primary">{project.name}</span>
          )}
          <NamePathLine project={project} />
        </div>
      </Cell>
      <Cell className="col-priority">{priority}</Cell>
      <Cell className="col-status">{status}</Cell>
      <Cell className="col-category">{category}</Cell>
      <Cell className="col-github">
        {project.githubStatus === "none" ? (
          <EmptyValue />
        ) : iconOnly ? (
          <span
            className={`gh-status gh-icon-only gh-${project.githubStatus}`}
            title={ghLabel}
            aria-label={ghLabel}
          >
            <GithubStatusIcon status={project.githubStatus} />
          </span>
        ) : (
          <span
            className={`gh-status gh-${project.githubStatus}`}
            title={ghLabel}
          >
            <span className="gh-dot" aria-hidden="true" />
            <span className="gh-label">{ghLabel}</span>
          </span>
        )}
      </Cell>
      <Cell className="col-actions">{actions}</Cell>
    </>
  );
}

function InteractiveRowCells({
  project,
  isDragging,
  allowDrag,
  dragHandleProps,
  onToggleFavorite,
  onPriorityChange,
  onStatusChange,
  onCategoryChange,
  onOpenBoard,
  actions,
  iconOnly = false,
}: {
  project: Project;
  isDragging: boolean;
  allowDrag: boolean;
  dragHandleProps: Record<string, unknown>;
  onToggleFavorite: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
  onStatusChange: (id: string, status: Status) => void;
  onCategoryChange: (id: string, category: Category) => void;
  onOpenBoard?: (project: Project) => void;
  actions: ReactNode;
  iconOnly?: boolean;
}) {
  return (
    <ProjectDataCells
      project={project}
      onOpenBoard={onOpenBoard}
      iconOnly={iconOnly}
      drag={
        <button
          type="button"
          className={`drag-handle${isDragging ? " is-active" : ""}${!allowDrag ? " is-disabled" : ""}`}
          aria-label={`Reorder ${project.name}`}
          disabled={!allowDrag}
          title={
            allowDrag
              ? "Drag to reorder"
              : "Switch to Custom sort to reorder"
          }
          {...(allowDrag ? dragHandleProps : {})}
        >
          <GripIcon />
        </button>
      }
      fav={
        <button
          type="button"
          className={`star-btn${project.favorite ? " is-on" : ""}`}
          aria-label={project.favorite ? "Unfavorite" : "Favorite"}
          aria-pressed={project.favorite}
          onClick={() => onToggleFavorite(project.id)}
        >
          ★
        </button>
      }
      priority={
        <PrioritySelect
          compact
          iconOnly={iconOnly}
          value={project.priority}
          label={`Priority for ${project.name}`}
          onChange={(priority) => onPriorityChange(project.id, priority)}
        />
      }
      status={
        <StatusSelect
          compact
          iconOnly={iconOnly}
          value={project.status}
          label={`Status for ${project.name}`}
          onChange={(status) => onStatusChange(project.id, status)}
        />
      }
      category={
        <CategorySelect
          compact
          iconOnly={iconOnly}
          value={project.category}
          label={`Category for ${project.name}`}
          onChange={(category) => onCategoryChange(project.id, category)}
        />
      }
      actions={actions}
    />
  );
}

function OverlayRowCells({
  project,
  iconOnly = false,
}: {
  project: Project;
  iconOnly?: boolean;
}) {
  const prio = project.priority.toLowerCase();
  const status = normalizeStatus(project.status);
  const statusSlug = statusClassSlug(status);
  const cat = normalizeCategory(project.category).toLowerCase();

  return (
    <ProjectDataCells
      project={project}
      iconOnly={iconOnly}
      drag={
        <span className="drag-handle is-active" aria-hidden="true">
          <GripIcon />
        </span>
      }
      fav={
        <span
          className={`star-btn${project.favorite ? " is-on" : ""}`}
          aria-hidden="true"
        >
          ★
        </span>
      }
      priority={
        iconOnly ? (
          <span
            className={`badge badge-icon priority-${prio}`}
            title={`Priority ${project.priority}`}
          >
            <PriorityIcon priority={project.priority} />
          </span>
        ) : (
          <span
            className={`badge priority-${prio}`}
            title={`Priority ${project.priority}`}
          >
            {project.priority}
          </span>
        )
      }
      status={
        iconOnly ? (
          <span
            className={`badge badge-icon status-${statusSlug}`}
            title={`Status ${status}`}
          >
            <StatusIcon status={status} />
          </span>
        ) : (
          <span
            className={`badge status-${statusSlug}`}
            title={`Status ${status}`}
          >
            {status}
          </span>
        )
      }
      category={
        iconOnly ? (
          <span
            className={`badge badge-icon category-${cat}`}
            title={`Category ${normalizeCategory(project.category)}`}
          >
            <CategoryIcon category={project.category} />
          </span>
        ) : (
          <span
            className={`badge category-${cat}`}
            title={`Category ${normalizeCategory(project.category)}`}
          >
            {normalizeCategory(project.category)}
          </span>
        )
      }
      actions={
        <span className="drag-overlay-actions muted">
          {project.hasRunScript ? "Run" : "Open"} ···
        </span>
      }
    />
  );
}

/** Presentational row clone for DragOverlay — same footprint as a real row. */
function ProjectRowOverlay({
  project,
  width,
  iconOnly = false,
}: {
  project: Project;
  width?: number;
  iconOnly?: boolean;
}) {
  const style: CSSProperties | undefined = width
    ? { width, minWidth: width }
    : undefined;

  return (
    <div
      className={`projects-table drag-overlay-table${iconOnly ? " is-icon-fields" : ""}`}
      style={style}
      aria-hidden="true"
    >
      <div
        className={`project-row is-drag-overlay priority-row-${project.priority.toLowerCase()}`}
        role="row"
      >
        <OverlayRowCells project={project} iconOnly={iconOnly} />
      </div>
    </div>
  );
}

/** Plain row — no useSortable (used for column header sorts). */
function ProjectRow({
  project,
  busyId,
  busyAction,
  archivedView,
  animateEnter = false,
  index = 0,
  iconOnly = false,
  allowDrag = false,
  isDragging = false,
  dragHandleProps,
  setNodeRef,
  style,
  onToggleFavorite,
  onPriorityChange,
  onStatusChange,
  onCategoryChange,
  onOpenBoard,
  onOpen,
  onRun,
  onReveal,
  onEdit,
  onArchive,
  onRestore,
}: RowProps & {
  allowDrag?: boolean;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
}) {
  // Opacity-only enter (no transform) so enter animation never fights dnd-kit FLIP.
  const rowStyle: CSSProperties | undefined = animateEnter
    ? {
        ...style,
        ["--stagger" as string]: `${Math.min(index, 5) * 45}ms`,
      }
    : style;

  return (
    <div
      ref={setNodeRef}
      style={rowStyle}
      role="row"
      className={`project-row${animateEnter ? " enter-fade" : ""} priority-row-${project.priority.toLowerCase()}${isDragging ? " is-dragging" : ""}`}
      data-dragging={isDragging || undefined}
    >
      <InteractiveRowCells
        project={project}
        isDragging={isDragging}
        allowDrag={allowDrag}
        dragHandleProps={dragHandleProps ?? {}}
        iconOnly={iconOnly}
        onToggleFavorite={onToggleFavorite}
        onPriorityChange={onPriorityChange}
        onStatusChange={onStatusChange}
        onCategoryChange={onCategoryChange}
        onOpenBoard={onOpenBoard}
        actions={
          <ProjectActions
            project={project}
            busyId={busyId}
            busyAction={busyAction}
            archivedView={archivedView}
            compact
            onOpen={onOpen}
            onRun={onRun}
            onReveal={onReveal}
            onEdit={onEdit}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        }
      />
    </div>
  );
}

/** Custom-sort only — mounts useSortable. */
function SortableProjectRow({
  reduceMotion = false,
  ...props
}: RowProps & { reduceMotion?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.project.id,
    transition: reduceMotion ? null : SORTABLE_TRANSITION,
  });

  // Translate-only — required for clean sibling slides (scale would stretch rows).
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  return (
    <ProjectRow
      {...props}
      allowDrag
      isDragging={isDragging}
      setNodeRef={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  ariaLabel,
  hideIndicator = false,
}: {
  label: ReactNode;
  sortKey: TableSortKey;
  sort: TableSortState;
  onSort: (key: TableSortKey) => void;
  className?: string;
  ariaLabel?: string;
  hideIndicator?: boolean;
}) {
  const active = sort.key === sortKey;
  const ariaSort =
    !active || sortKey === "custom"
      ? active && sortKey === "custom"
        ? "other"
        : "none"
      : sort.dir === "asc"
        ? "ascending"
        : "descending";
  const showIndicator = active && sortKey !== "custom" && !hideIndicator;

  return (
    <div
      role="columnheader"
      className={className}
      aria-sort={ariaSort as "none" | "ascending" | "descending" | "other"}
    >
      <button
        type="button"
        className={`col-sort-btn${active ? " is-active" : ""}${ariaLabel ? " is-icon" : ""}`}
        onClick={() => onSort(sortKey)}
        aria-pressed={active}
        aria-label={
          ariaLabel
            ? active
              ? `Sort by ${ariaLabel}, ${sort.dir === "asc" ? "ascending" : "descending"}`
              : `Sort by ${ariaLabel}`
            : undefined
        }
      >
        <span aria-hidden={ariaLabel ? true : undefined}>{label}</span>
        {showIndicator ? (
          <span className="sort-ind" aria-hidden="true">
            {sort.dir === "asc" ? "▲" : "▼"}
          </span>
        ) : null}
      </button>
    </div>
  );
}

interface TableProps {
  projects: Project[];
  layout: UiLayout;
  busyId: string | null;
  busyAction: "open" | "reveal" | "run" | null;
  archivedView: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  onAdd?: () => void;
  addBusy?: boolean;
  addDisabled?: boolean;
  onReorder: (activeId: string, overId: string) => void;
  onToggleFavorite: (id: string) => void;
  onPriorityChange: (id: string, priority: Priority) => void;
  onStatusChange: (id: string, status: Status) => void;
  onCategoryChange: (id: string, category: Category) => void;
  onOpenBoard?: (project: Project) => void;
  onOpen: (project: Project) => void;
  onRun: (project: Project) => void;
  onReveal: (project: Project) => void;
  onEdit: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
}

export function ProjectsTable({
  projects,
  layout,
  busyId,
  busyAction,
  archivedView,
  emptyMessage = "No projects yet.",
  emptyHint = "Add a local folder or import from Hub, VCC, or GitHub.",
  onAdd,
  addBusy,
  addDisabled,
  onReorder,
  onToggleFavorite,
  onPriorityChange,
  onStatusChange,
  onCategoryChange,
  onOpenBoard,
  onOpen,
  onRun,
  onReveal,
  onEdit,
  onArchive,
  onRestore,
}: TableProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = useState<number | undefined>();
  const [sort, setSort] = useState<TableSortState>(() => readStoredSort());
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [animateEnter, setAnimateEnter] = useState(true);
  useEffect(() => {
    setAnimateEnter(false);
  }, []);

  const allowDrag = sort.key === "custom";
  const iconOnly = layout === "phone";

  // Same-key dir toggle: reverse prior result instead of full compare re-sort.
  const sortCacheRef = useRef<{
    projects: Project[];
    key: Exclude<TableSortKey, "custom">;
    dir: "asc" | "desc";
    result: Project[];
  } | null>(null);

  const displayProjects = useMemo(() => {
    if (sort.key === "custom") {
      sortCacheRef.current = null;
      return projects;
    }
    const key = sort.key;
    const cache = sortCacheRef.current;
    if (
      cache &&
      cache.projects === projects &&
      cache.key === key &&
      cache.dir !== sort.dir
    ) {
      const reversed = [...cache.result].reverse();
      sortCacheRef.current = {
        projects,
        key,
        dir: sort.dir,
        result: reversed,
      };
      return reversed;
    }
    const result = [...projects].sort((a, b) =>
      compareProjects(a, b, key, sort.dir),
    );
    sortCacheRef.current = { projects, key, dir: sort.dir, result };
    return result;
  }, [projects, sort]);

  const itemIds = useMemo(
    () => displayProjects.map((p) => p.id),
    [displayProjects],
  );
  const activeProject = useMemo(
    () =>
      activeId
        ? (displayProjects.find((p) => p.id === activeId) ?? null)
        : null,
    [displayProjects, activeId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleSort(key: TableSortKey) {
    setActiveId(null);
    setOverlayWidth(undefined);
    const next: TableSortState =
      key === "custom"
        ? DEFAULT_SORT
        : { key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" };
    writeStoredSort(next);
    setSort(next);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setOverlayWidth(event.active.rect.current.initial?.width);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setOverlayWidth(undefined);
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverlayWidth(undefined);
  }

  if (projects.length === 0) {
    return (
      <div className="empty-state enter-rise" role="status">
        <p className="empty-title">{emptyMessage}</p>
        <p className="muted empty-hint">{emptyHint}</p>
        {onAdd && (
          <button
            type="button"
            className="btn-primary"
            disabled={addDisabled}
            aria-busy={addBusy}
            onClick={onAdd}
          >
            {addBusy ? (
              <span className="btn-busy-label">
                <Spinner size="sm" />
                Adding…
              </span>
            ) : (
              "+ Add project"
            )}
          </button>
        )}
      </div>
    );
  }

  const sharedProps = {
    busyId,
    busyAction,
    archivedView,
    animateEnter,
    iconOnly,
    onToggleFavorite,
    onPriorityChange,
    onStatusChange,
    onCategoryChange,
    onOpenBoard,
    onOpen,
    onRun,
    onReveal,
    onEdit,
    onArchive,
    onRestore,
  };

  const table = (
    <div
      className={`table-wrap table-wrap-${layout}${activeId ? " is-sorting" : ""}`}
    >
      <div
        className={`projects-table${iconOnly ? " is-icon-fields" : ""}`}
        role="table"
        aria-label="Projects"
      >
        <div className="projects-table-head" role="rowgroup">
          <div className="projects-table-header-row" role="row">
            <SortHeader
              label="Custom"
              sortKey="custom"
              sort={sort}
              onSort={handleSort}
              className="col-drag"
            />
            <SortHeader
              label="★"
              ariaLabel="stars"
              sortKey="favorite"
              sort={sort}
              onSort={handleSort}
              className="col-fav"
              hideIndicator
            />
            <SortHeader
              label={iconOnly ? <PlatformHeaderIcon /> : "Platform"}
              ariaLabel={iconOnly ? "platform" : undefined}
              sortKey="platform"
              sort={sort}
              onSort={handleSort}
              className="col-platform"
            />
            <SortHeader
              label="Name"
              sortKey="name"
              sort={sort}
              onSort={handleSort}
              className="col-name"
            />
            <SortHeader
              label={iconOnly ? <PriorityHeaderIcon /> : "Priority"}
              ariaLabel={iconOnly ? "priority" : undefined}
              sortKey="priority"
              sort={sort}
              onSort={handleSort}
              className="col-priority"
            />
            <SortHeader
              label={iconOnly ? <StatusHeaderIcon /> : "Status"}
              ariaLabel={iconOnly ? "status" : undefined}
              sortKey="status"
              sort={sort}
              onSort={handleSort}
              className="col-status"
            />
            <SortHeader
              label={iconOnly ? <CategoryHeaderIcon /> : "Category"}
              ariaLabel={iconOnly ? "category" : undefined}
              sortKey="category"
              sort={sort}
              onSort={handleSort}
              className="col-category"
            />
            <SortHeader
              label={iconOnly ? <GithubHeaderIcon /> : "GitHub"}
              ariaLabel={iconOnly ? "GitHub" : undefined}
              sortKey="github"
              sort={sort}
              onSort={handleSort}
              className="col-github"
            />
            <div role="columnheader" className="col-actions">
              Actions
            </div>
          </div>
        </div>
        <div className="projects-table-body" role="rowgroup">
          {displayProjects.map((project, index) =>
            allowDrag ? (
              <SortableProjectRow
                key={project.id}
                project={project}
                index={animateEnter ? index : 0}
                reduceMotion={reduceMotion}
                {...sharedProps}
              />
            ) : (
              <ProjectRow
                key={project.id}
                project={project}
                index={animateEnter ? index : 0}
                {...sharedProps}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );

  if (!allowDrag) {
    return table;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {table}
      </SortableContext>
      <DragOverlay dropAnimation={reduceMotion ? null : DROP_ANIMATION} zIndex={40}>
        {activeProject ? (
          <ProjectRowOverlay
            project={activeProject}
            width={overlayWidth}
            iconOnly={iconOnly}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
