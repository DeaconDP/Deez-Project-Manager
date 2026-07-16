import {
  createEmptyTask,
  KANBAN_COLUMNS,
  normalizeKanbanColumn,
  normalizePriority,
  PRIORITY_RANK,
  type KanbanColumn,
  type Priority,
  type Task,
  type TaskComment,
  type TrelloImportResult,
} from "../types";

export function tasksForProject(tasks: Task[], projectId: string): Task[] {
  return tasks
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => a.sortIndex - b.sortIndex);
}

export function tasksInColumn(tasks: Task[], column: KanbanColumn): Task[] {
  return tasks
    .filter((t) => t.column === column)
    .sort((a, b) => a.sortIndex - b.sortIndex);
}

/** Insert / re-rank by Crit→Opt within a column; returns full task list with reindexed column. */
export function placeByPriority(
  allTasks: Task[],
  task: Task,
  column: KanbanColumn = task.column,
): Task[] {
  const others = allTasks.filter((t) => t.id !== task.id);
  const inCol = others
    .filter((t) => t.projectId === task.projectId && t.column === column)
    .sort((a, b) => a.sortIndex - b.sortIndex);

  const placed = { ...task, column, updatedAt: new Date().toISOString() };
  let insertAt = inCol.findIndex(
    (t) => PRIORITY_RANK[t.priority] > PRIORITY_RANK[placed.priority],
  );
  if (insertAt < 0) insertAt = inCol.length;
  inCol.splice(insertAt, 0, placed);

  const reindexed = inCol.map((t, i) => ({ ...t, sortIndex: i }));
  const rest = others.filter(
    (t) => !(t.projectId === task.projectId && t.column === column),
  );
  return [...rest, ...reindexed];
}

export function reindexColumn(
  allTasks: Task[],
  projectId: string,
  column: KanbanColumn,
  orderedIds: string[],
): Task[] {
  const idSet = new Set(orderedIds);
  const rest = allTasks.filter(
    (t) =>
      !(t.projectId === projectId && t.column === column && idSet.has(t.id)),
  );
  const byId = new Map(
    allTasks
      .filter((t) => t.projectId === projectId && t.column === column)
      .map((t) => [t.id, t]),
  );
  const now = new Date().toISOString();
  const reindexed = orderedIds
    .map((id, i) => {
      const t = byId.get(id);
      if (!t) return null;
      return { ...t, column, sortIndex: i, updatedAt: now };
    })
    .filter((t): t is Task => t != null);
  return [...rest, ...reindexed];
}

/** Move task to column at index; reindex source + dest columns. */
export function moveTaskInBoard(
  allTasks: Task[],
  taskId: string,
  toColumn: KanbanColumn,
  toIndex: number,
): Task[] {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return allTasks;
  const projectId = task.projectId;
  const fromColumn = task.column;
  const others = allTasks.filter((t) => t.id !== taskId);

  const fromOrdered = others
    .filter((t) => t.projectId === projectId && t.column === fromColumn)
    .sort((a, b) => a.sortIndex - b.sortIndex)
    .map((t, i) => ({ ...t, sortIndex: i }));

  const destBase =
    fromColumn === toColumn
      ? [...fromOrdered]
      : others
          .filter((t) => t.projectId === projectId && t.column === toColumn)
          .sort((a, b) => a.sortIndex - b.sortIndex);

  const clamped = Math.max(0, Math.min(toIndex, destBase.length));
  destBase.splice(clamped, 0, {
    ...task,
    column: toColumn,
    updatedAt: new Date().toISOString(),
  });
  const destReindexed = destBase.map((t, i) => ({
    ...t,
    column: toColumn,
    sortIndex: i,
  }));

  const rest = others.filter(
    (t) =>
      !(
        t.projectId === projectId &&
        (t.column === fromColumn || t.column === toColumn)
      ),
  );

  if (fromColumn === toColumn) {
    return [...rest, ...destReindexed];
  }
  return [...rest, ...fromOrdered, ...destReindexed];
}

export function addCommentToTask(
  allTasks: Task[],
  taskId: string,
  body: string,
): Task[] {
  const trimmed = body.trim();
  if (!trimmed) return allTasks;
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  return allTasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          comments: [...t.comments, comment],
          updatedAt: new Date().toISOString(),
        }
      : t,
  );
}

function mapTrelloListToColumn(listName: string): KanbanColumn {
  const n = listName.toLowerCase();
  if (/\b(done|complete|closed|finished)\b/.test(n)) return "Done";
  if (/\b(test|testing|qa|uats?)\b/.test(n)) return "Testing";
  if (/\b(doing|progress|wip|working|active|sprint)\b/.test(n)) return "Doing";
  if (/\b(priority|priorit|p0|urgent|up next)\b/.test(n)) return "Priority";
  if (/\b(backlog|ideas?|icebox|someday|parked)\b/.test(n)) return "Backlog";
  return "Backlog";
}

function mapTrelloPriority(card: {
  labels?: { name?: string; color?: string }[];
  desc?: string;
}): Priority {
  const labels = (card.labels ?? [])
    .map((l) => (l.name ?? "").toLowerCase())
    .join(" ");
  const blob = `${labels} ${(card.desc ?? "").slice(0, 200)}`.toLowerCase();
  if (/\b(crit|critical|p0)\b/.test(blob)) return "Crit";
  if (/\b(high|p1)\b/.test(blob)) return "High";
  if (/\b(med|medium|p2)\b/.test(blob)) return "Med";
  if (/\b(low|p3)\b/.test(blob)) return "Low";
  if (/\b(opt|optional|default)\b/.test(blob)) return "Default";
  return "Default";
}

interface TrelloExport {
  lists?: { id: string; name: string; closed?: boolean }[];
  cards?: {
    id: string;
    idList: string;
    name: string;
    desc?: string;
    closed?: boolean;
    labels?: { name?: string; color?: string }[];
  }[];
  actions?: {
    type?: string;
    data?: { card?: { id?: string }; text?: string };
    date?: string;
  }[];
}

export function parseTrelloBoardJson(
  raw: string,
  projectId: string,
  existing: Task[],
): TrelloImportResult {
  let data: TrelloExport;
  try {
    data = JSON.parse(raw) as TrelloExport;
  } catch {
    throw new Error("TRELLO-001: invalid JSON");
  }
  if (!Array.isArray(data.cards) || !Array.isArray(data.lists)) {
    throw new Error("TRELLO-002: not a Trello board export (need lists + cards)");
  }

  const listMap = new Map(
    data.lists
      .filter((l) => !l.closed)
      .map((l) => [l.id, mapTrelloListToColumn(l.name)] as const),
  );

  const existingIds = new Set(
    existing
      .filter((t) => t.projectId === projectId && t.trelloCardId)
      .map((t) => t.trelloCardId!),
  );

  const commentsByCard = new Map<string, TaskComment[]>();
  for (const action of data.actions ?? []) {
    if (action.type !== "commentCard") continue;
    const cardId = action.data?.card?.id;
    const text = action.data?.text?.trim();
    if (!cardId || !text) continue;
    const list = commentsByCard.get(cardId) ?? [];
    list.push({
      id: crypto.randomUUID(),
      body: text,
      createdAt: action.date ?? new Date().toISOString(),
    });
    commentsByCard.set(cardId, list);
  }

  const byColumn: Record<KanbanColumn, Task[]> = {
    Backlog: [],
    Priority: [],
    Doing: [],
    Testing: [],
    Done: [],
  };

  let added = 0;
  let skipped = 0;

  for (const card of data.cards) {
    if (card.closed) continue;
    if (existingIds.has(card.id)) {
      skipped += 1;
      continue;
    }
    const column = listMap.get(card.idList) ?? "Backlog";
    const task = createEmptyTask(projectId, {
      title: card.name || "Untitled",
      description: card.desc ?? "",
      column,
      priority: mapTrelloPriority(card),
      comments: commentsByCard.get(card.id) ?? [],
      trelloCardId: card.id,
    });
    byColumn[column].push(task);
    added += 1;
  }

  // Sort each column by priority then append with sortIndex after existing
  let next = [...existing];
  for (const col of KANBAN_COLUMNS) {
    const incoming = byColumn[col].sort(
      (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );
    for (const task of incoming) {
      next = placeByPriority(next, task, col);
    }
  }

  return { added, skipped, tasks: next };
}

export function normalizeTask(t: Task): Task {
  return {
    ...t,
    column: normalizeKanbanColumn(t.column),
    priority: normalizePriority(t.priority),
    description: t.description ?? "",
    comments: t.comments ?? [],
  };
}
