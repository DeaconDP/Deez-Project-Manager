import { useCallback, useEffect, useRef, useState } from "react";
import { getProjects, healProjectEngines, saveProjects } from "../api";
import {
  addCommentToTask,
  moveTaskInBoard,
  normalizeTask,
  parseTrelloBoardJson,
  placeByPriority,
} from "../lib/kanban";
import {
  createEmptyTask,
  normalizeCategory,
  normalizeKanbanColumn,
  normalizePriority,
  normalizeStatus,
  type Category,
  type GitSyncUpdated,
  type KanbanColumn,
  type Priority,
  type Project,
  type ProjectStore,
  type Status,
  type Task,
  type TrelloImportResult,
} from "../types";

function normalizeProject(p: Project): Project {
  return {
    ...p,
    archived: p.archived ?? false,
    tools: p.tools ?? [],
    hasRunScript: p.hasRunScript ?? false,
    gitAhead: p.gitAhead ?? 0,
    gitBehind: p.gitBehind ?? 0,
    gitBranch: p.gitBranch ?? null,
    gitDirty: p.gitDirty ?? false,
    category: normalizeCategory(p.category),
    priority: normalizePriority(p.priority),
    status: normalizeStatus(p.status),
  };
}

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.sortIndex - b.sortIndex);
}

function withReindexed(projects: Project[]): Project[] {
  return projects.map((p, i) => ({ ...p, sortIndex: i }));
}

function mergeHealedFields(current: Project[], healed: Project[]): Project[] {
  const byId = new Map(healed.map((p) => [p.id, normalizeProject(p)]));
  let changed = false;
  const next = current.map((p) => {
    const h = byId.get(p.id);
    if (!h) return p;
    const toolsSame =
      (p.tools?.length ?? 0) === (h.tools?.length ?? 0) &&
      (p.tools ?? []).every((t, i) => t === h.tools[i]);
    if (
      p.platform === h.platform &&
      p.unityVersion === h.unityVersion &&
      p.hasRunScript === h.hasRunScript &&
      toolsSame
    ) {
      return p;
    }
    changed = true;
    return {
      ...p,
      platform: h.platform,
      unityVersion: h.unityVersion,
      tools: h.tools,
      hasRunScript: h.hasRunScript,
    };
  });
  return changed ? next : current;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [syncRoots, setSyncRootsState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const latestRef = useRef<Project[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const syncRootsRef = useRef<string[]>([]);
  const healStartedRef = useRef(false);

  const persist = useCallback((next: Project[], nextTasks?: Task[], roots?: string[]) => {
    latestRef.current = next;
    setProjects(next);
    if (nextTasks !== undefined) {
      tasksRef.current = nextTasks;
      setTasks(nextTasks);
    }
    if (roots !== undefined) {
      syncRootsRef.current = roots;
      setSyncRootsState(roots);
    }
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
    }
    setSaving(true);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const store: ProjectStore = {
          version: 1,
          projects: latestRef.current,
          syncRoots: syncRootsRef.current,
          tasks: tasksRef.current,
        };
        await saveProjects(store);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    }, 300);
  }, []);

  const persistTasks = useCallback(
    (nextTasks: Task[]) => {
      persist(latestRef.current, nextTasks);
    },
    [persist],
  );

  const applyHealedProjects = useCallback((healed: Project[]) => {
    const next = mergeHealedFields(latestRef.current, healed);
    if (next === latestRef.current) return;
    latestRef.current = next;
    setProjects(next);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    healStartedRef.current = false;
    try {
      const store = await getProjects();
      const sorted = sortProjects((store.projects ?? []).map(normalizeProject));
      const loadedTasks = (store.tasks ?? []).map(normalizeTask);
      const roots = store.syncRoots ?? [];
      latestRef.current = sorted;
      tasksRef.current = loadedTasks;
      syncRootsRef.current = roots;
      setProjects(sorted);
      setTasks(loadedTasks);
      setSyncRootsState(roots);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      if (saveTimer.current != null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [reload]);

  // After first paint, heal engine labels in the background (store already saved in Rust).
  useEffect(() => {
    if (loading || healStartedRef.current) return;
    healStartedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const healed = await healProjectEngines();
        if (!cancelled) applyHealedProjects(healed);
      } catch {
        // Non-fatal — labels heal on next Sync / Refresh cycle.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, applyHealedProjects]);

  const replaceAll = useCallback(
    (next: Project[]) => {
      const normalized = next.map(normalizeProject);
      persist(withReindexed(sortProjects(normalized)));
    },
    [persist],
  );

  /** Merge a background git-fetch result without re-persisting (Rust already saved). */
  const applyGitSyncUpdate = useCallback((update: GitSyncUpdated) => {
    const next = latestRef.current.map((p) =>
      p.id === update.id
        ? {
            ...p,
            githubStatus: update.githubStatus,
            gitAhead: update.gitAhead,
            gitBehind: update.gitBehind,
            gitBranch: update.gitBranch,
            gitDirty: update.gitDirty,
          }
        : p,
    );
    latestRef.current = next;
    setProjects(next);
  }, []);

  const setSyncRoots = useCallback((roots: string[]) => {
    syncRootsRef.current = roots;
    setSyncRootsState(roots);
  }, []);

  const upsert = useCallback(
    (project: Project) => {
      const cleaned = {
        ...project,
        category: normalizeCategory(project.category),
        priority: normalizePriority(project.priority),
        status: normalizeStatus(project.status),
      };
      const exists = latestRef.current.some((p) => p.id === cleaned.id);
      const next = exists
        ? latestRef.current.map((p) => (p.id === cleaned.id ? cleaned : p))
        : [...latestRef.current, cleaned];
      persist(withReindexed(sortProjects(next)));
    },
    [persist],
  );

  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      const next = latestRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              archived,
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      persist(next);
    },
    [persist],
  );

  const removeByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nextProjects = withReindexed(
        latestRef.current.filter((p) => !idSet.has(p.id)),
      );
      const nextTasks = tasksRef.current.filter((t) => !idSet.has(t.projectId));
      persist(nextProjects, nextTasks);
    },
    [persist],
  );

  const reorder = useCallback(
    (visibleIds: string[], activeId: string, overId: string) => {
      const ids = [...visibleIds];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);

      const byId = new Map(latestRef.current.map((p) => [p.id, p]));
      const visibleSet = new Set(ids);
      let nextVisible = 0;
      const next = latestRef.current.map((p) => {
        if (!visibleSet.has(p.id)) return p;
        const id = ids[nextVisible++];
        return byId.get(id) ?? p;
      });
      persist(withReindexed(next));
    },
    [persist],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      const next = latestRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              favorite: !p.favorite,
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      persist(next);
    },
    [persist],
  );

  const setPriority = useCallback(
    (id: string, priority: Priority) => {
      const next = latestRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              priority,
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      persist(next);
    },
    [persist],
  );

  const setCategory = useCallback(
    (id: string, category: Category) => {
      const next = latestRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              category,
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      persist(next);
    },
    [persist],
  );

  const setStatus = useCallback(
    (id: string, status: Status) => {
      const next = latestRef.current.map((p) =>
        p.id === id
          ? {
              ...p,
              status,
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
      persist(next);
    },
    [persist],
  );

  const addTask = useCallback(
    (projectId: string, input: { title: string; priority?: Priority; column?: KanbanColumn }) => {
      const title = input.title.trim();
      if (!title) return null;
      const task = createEmptyTask(projectId, {
        title,
        priority: input.priority ?? "Default",
        column: input.column ?? "Backlog",
      });
      persistTasks(placeByPriority(tasksRef.current, task, task.column));
      return task;
    },
    [persistTasks],
  );

  const updateTask = useCallback(
    (taskId: string, patch: Partial<Task>) => {
      const current = tasksRef.current.find((t) => t.id === taskId);
      if (!current) return;
      const nextTask: Task = {
        ...current,
        ...patch,
        id: current.id,
        projectId: current.projectId,
        column: normalizeKanbanColumn(patch.column ?? current.column),
        priority: normalizePriority(patch.priority ?? current.priority),
        updatedAt: new Date().toISOString(),
      };
      const priorityChanged = nextTask.priority !== current.priority;
      const columnChanged = nextTask.column !== current.column;
      if (priorityChanged || columnChanged) {
        persistTasks(placeByPriority(tasksRef.current, nextTask, nextTask.column));
      } else {
        persistTasks(
          tasksRef.current.map((t) => (t.id === taskId ? nextTask : t)),
        );
      }
    },
    [persistTasks],
  );

  const moveTask = useCallback(
    (taskId: string, toColumn: KanbanColumn, toIndex: number) => {
      persistTasks(moveTaskInBoard(tasksRef.current, taskId, toColumn, toIndex));
    },
    [persistTasks],
  );

  const addTaskComment = useCallback(
    (taskId: string, body: string) => {
      persistTasks(addCommentToTask(tasksRef.current, taskId, body));
    },
    [persistTasks],
  );

  const importTrelloTasks = useCallback(
    (projectId: string, rawJson: string): TrelloImportResult => {
      const result = parseTrelloBoardJson(rawJson, projectId, tasksRef.current);
      persistTasks(result.tasks);
      return result;
    },
    [persistTasks],
  );

  return {
    projects,
    tasks,
    syncRoots,
    loading,
    saving,
    error,
    setError,
    reload,
    replaceAll,
    applyGitSyncUpdate,
    setSyncRoots,
    upsert,
    setArchived,
    removeByIds,
    reorder,
    toggleFavorite,
    setPriority,
    setCategory,
    setStatus,
    addTask,
    updateTask,
    moveTask,
    addTaskComment,
    importTrelloTasks,
  };
}
