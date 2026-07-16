import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { pickTrelloJson, readTextFile } from "../api";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useTasks, type TaskMutations } from "../hooks/useTasks";
import { tasksInColumn } from "../lib/kanban";
import {
  KANBAN_COLUMNS,
  priorityLabel,
  type KanbanColumn,
  type Priority,
  type Project,
  type Task,
} from "../types";
import { ActionFeedback } from "./ActionFeedback";
import { PrioritySelect } from "./PrioritySelect";
import { Spinner } from "./Spinner";
import { TaskDetailModal } from "./TaskDetailModal";

/** Sibling FLIP while dragging — match projects table. */
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

type ItemsByColumn = Record<KanbanColumn, string[]>;

interface Props {
  project: Project;
  allTasks: Task[];
  mutations: TaskMutations;
  onBack: () => void;
}

export function KanbanBoard({ project, allTasks, mutations, onBack }: Props) {
  const { tasks, addTask, updateTask, moveTask, addTaskComment, importTrello } =
    useTasks(allTasks, project.id, mutations);
  const boardAction = useAsyncAction();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ItemsByColumn | null>(null);
  const previewRef = useRef<ItemsByColumn | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("Default");
  const [newColumn, setNewColumn] = useState<KanbanColumn>("Backlog");
  const [reduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) ?? null,
    [tasks, selectedId],
  );
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byColumn = useMemo(() => {
    const map = {} as Record<KanbanColumn, Task[]>;
    for (const col of KANBAN_COLUMNS) {
      map[col] = tasksInColumn(tasks, col);
    }
    return map;
  }, [tasks]);

  const displayByColumn = useMemo(() => {
    if (!preview) return byColumn;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const map = {} as Record<KanbanColumn, Task[]>;
    for (const col of KANBAN_COLUMNS) {
      map[col] = preview[col]
        .map((id) => byId.get(id))
        .filter((t): t is Task => t != null);
    }
    return map;
  }, [preview, byColumn, tasks]);

  function setPreviewSynced(next: ItemsByColumn | null) {
    previewRef.current = next;
    setPreview(next);
  }

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    const snap = snapshotItems(byColumn);
    setPreviewSynced(snap);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeTaskId = String(active.id);
    const overId = String(over.id);
    if (activeTaskId === overId) return;

    const prev = previewRef.current;
    if (!prev) return;

    const fromCol = findColumnOfId(prev, activeTaskId);
    const toCol = columnFromOverId(overId, prev);
    if (!fromCol || !toCol) return;

    let next: ItemsByColumn;
    if (fromCol === toCol) {
      const list = prev[fromCol];
      const fromIndex = list.indexOf(activeTaskId);
      const overIndex = overId.startsWith("col:")
        ? list.length - 1
        : list.indexOf(overId);
      if (fromIndex < 0 || overIndex < 0 || fromIndex === overIndex) return;
      const moved = arrayMove(list, fromIndex, overIndex);
      if (sameOrder(moved, list)) return;
      next = { ...prev, [fromCol]: moved };
    } else {
      const fromList = prev[fromCol].filter((id) => id !== activeTaskId);
      const toList = [...prev[toCol]];
      let toIndex = overId.startsWith("col:")
        ? toList.length
        : toList.indexOf(overId);
      if (toIndex < 0) toIndex = toList.length;
      toList.splice(toIndex, 0, activeTaskId);
      next = { ...prev, [fromCol]: fromList, [toCol]: toList };
    }
    setPreviewSynced(next);
  }

  function handleDragEnd(_e: DragEndEvent) {
    const id = activeId;
    const snap = previewRef.current;
    setActiveId(null);
    setPreviewSynced(null);
    if (!id || !snap) return;

    let toColumn: KanbanColumn | null = null;
    let toIndex = 0;
    for (const col of KANBAN_COLUMNS) {
      const i = snap[col].indexOf(id);
      if (i >= 0) {
        toColumn = col;
        toIndex = i;
        break;
      }
    }
    if (!toColumn) return;

    const original = tasks.find((t) => t.id === id);
    if (!original) return;
    if (original.column === toColumn && original.sortIndex === toIndex) return;
    moveTask(id, toColumn, toIndex);
  }

  function handleDragCancel() {
    setActiveId(null);
    setPreviewSynced(null);
  }

  async function handleAddSubmit() {
    await boardAction.run(
      async () => {
        const created = addTask({
          title: newTitle,
          priority: newPriority,
          column: newColumn,
        });
        if (!created) throw new Error("Title is required");
        setNewTitle("");
        setNewPriority("Default");
        setNewColumn("Backlog");
        setAddOpen(false);
        return `Added “${created.title}”`;
      },
      { loading: "Adding task…" },
    );
  }

  async function handleImportTrello() {
    await boardAction.run(
      async () => {
        const path = await pickTrelloJson();
        if (!path) return "__cancel__";
        const raw = await readTextFile(path);
        const result = importTrello(raw);
        return `Imported ${result.added}, skipped ${result.skipped}`;
      },
      { loading: "Importing Trello…" },
    );
  }

  return (
    <div className={`kanban${activeId ? " is-sorting" : ""}`}>
      <header className="kanban-header">
        <div className="kanban-header-left">
          <button type="button" className="btn-ghost" onClick={onBack}>
            ← Projects
          </button>
          <h1 className="kanban-title">{project.name}</h1>
        </div>
        <div className="kanban-header-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={boardAction.busy}
            aria-busy={boardAction.busy}
            onClick={() => void handleImportTrello()}
          >
            Import Trell (beta)
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={boardAction.busy}
            onClick={() => setAddOpen((v) => !v)}
          >
            + Add task
          </button>
        </div>
      </header>

      <ActionFeedback
        feedback={boardAction.feedback}
        onDismiss={() => boardAction.clear()}
      />

      {addOpen ? (
        <form
          className="kanban-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddSubmit();
          }}
        >
          <label>
            <span className="sr-only">Task title</span>
            <input
              autoFocus
              placeholder="Task title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={boardAction.busy}
            />
          </label>
          <PrioritySelect
            value={newPriority}
            optLabel
            label="New task priority"
            onChange={setNewPriority}
            disabled={boardAction.busy}
          />
          <select
            value={newColumn}
            aria-label="Column"
            disabled={boardAction.busy}
            onChange={(e) => setNewColumn(e.target.value as KanbanColumn)}
          >
            {KANBAN_COLUMNS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn-primary"
            disabled={!newTitle.trim() || boardAction.busy}
            aria-busy={boardAction.busy}
          >
            {boardAction.busy ? (
              <span className="btn-busy-label">
                <Spinner size="sm" />
                Adding…
              </span>
            ) : (
              "Add"
            )}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={boardAction.busy}
            onClick={() => setAddOpen(false)}
          >
            Cancel
          </button>
        </form>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="kanban-columns" role="list" aria-label="Kanban columns">
          {KANBAN_COLUMNS.map((column) => (
            <KanbanColumnPane
              key={column}
              column={column}
              tasks={displayByColumn[column]}
              reduceMotion={reduceMotion}
              onOpenTask={setSelectedId}
            />
          ))}
        </div>
        <DragOverlay
          dropAnimation={reduceMotion ? null : DROP_ANIMATION}
          zIndex={40}
        >
          {activeTask ? <TaskCard task={activeTask} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal
        open={!!selected}
        task={selected}
        onClose={() => setSelectedId(null)}
        onSave={(patch) => {
          if (selected) updateTask(selected.id, patch);
        }}
        onAddComment={(body) => {
          if (selected) addTaskComment(selected.id, body);
        }}
      />
    </div>
  );
}

function snapshotItems(byColumn: Record<KanbanColumn, Task[]>): ItemsByColumn {
  const out = {} as ItemsByColumn;
  for (const col of KANBAN_COLUMNS) {
    out[col] = byColumn[col].map((t) => t.id);
  }
  return out;
}

function findColumnOfId(items: ItemsByColumn, id: string): KanbanColumn | null {
  for (const col of KANBAN_COLUMNS) {
    if (items[col].includes(id)) return col;
  }
  return null;
}

function columnFromOverId(
  overId: string,
  items: ItemsByColumn,
): KanbanColumn | null {
  if (overId.startsWith("col:")) {
    return overId.slice(4) as KanbanColumn;
  }
  return findColumnOfId(items, overId);
}

function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function colDropId(column: KanbanColumn): string {
  return `col:${column}`;
}

function KanbanColumnPane({
  column,
  tasks,
  reduceMotion,
  onOpenTask,
}: {
  column: KanbanColumn;
  tasks: Task[];
  reduceMotion: boolean;
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colDropId(column) });
  const ids = tasks.map((t) => t.id);

  return (
    <section
      className={`kanban-column${isOver ? " is-over" : ""}`}
      ref={setNodeRef}
      role="list"
      aria-label={column}
    >
      <header className="kanban-column-header">
        <h2>{column}</h2>
        <span className="kanban-column-count">{tasks.length}</span>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="kanban-column-cards">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              reduceMotion={reduceMotion}
              onOpen={() => onOpenTask(task.id)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableTaskCard({
  task,
  reduceMotion,
  onOpen,
}: {
  task: Task;
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    transition: reduceMotion ? null : SORTABLE_TRANSITION,
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} dragging={isDragging} onOpen={onOpen} />
    </div>
  );
}

function TaskCard({
  task,
  overlay,
  dragging,
  onOpen,
}: {
  task: Task;
  overlay?: boolean;
  dragging?: boolean;
  onOpen?: () => void;
}) {
  const prio = task.priority.toLowerCase();
  return (
    <article
      className={`kanban-card priority-row-${prio}${dragging ? " is-dragging" : ""}${overlay ? " is-overlay" : ""}`}
    >
      <button
        type="button"
        className="kanban-card-open"
        onClick={() => onOpen?.()}
      >
        <span className="kanban-card-title">{task.title}</span>
        <span className={`badge priority-${prio}`}>
          {priorityLabel(task.priority, true)}
        </span>
        {task.comments.length > 0 ? (
          <span
            className="kanban-card-comments"
            aria-label={`${task.comments.length} comments`}
          >
            {task.comments.length} cmt
          </span>
        ) : null}
      </button>
    </article>
  );
}
