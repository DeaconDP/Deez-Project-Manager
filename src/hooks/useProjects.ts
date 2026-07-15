import { useCallback, useEffect, useRef, useState } from "react";
import { getProjects, saveProjects } from "../api";
import {
  normalizeCategory,
  normalizePriority,
  normalizeStatus,
  type Category,
  type Priority,
  type Project,
  type ProjectStore,
  type Status,
} from "../types";

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.sortIndex - b.sortIndex);
}

function withReindexed(projects: Project[]): Project[] {
  return projects.map((p, i) => ({ ...p, sortIndex: i }));
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [syncRoots, setSyncRootsState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const latestRef = useRef<Project[]>([]);
  const syncRootsRef = useRef<string[]>([]);

  const persist = useCallback((next: Project[], roots?: string[]) => {
    latestRef.current = next;
    setProjects(next);
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

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const store = await getProjects();
      const sorted = sortProjects(
        (store.projects ?? []).map((p) => ({
          ...p,
          archived: p.archived ?? false,
          category: normalizeCategory(p.category),
          priority: normalizePriority(p.priority),
          status: normalizeStatus(p.status),
        })),
      );
      const roots = store.syncRoots ?? [];
      latestRef.current = sorted;
      syncRootsRef.current = roots;
      setProjects(sorted);
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

  const replaceAll = useCallback(
    (next: Project[]) => {
      const normalized = next.map((p) => ({
        ...p,
        category: normalizeCategory(p.category),
        priority: normalizePriority(p.priority),
        status: normalizeStatus(p.status),
      }));
      persist(withReindexed(sortProjects(normalized)));
    },
    [persist],
  );

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

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      const list = [...latestRef.current];
      const from = list.findIndex((p) => p.id === activeId);
      const to = list.findIndex((p) => p.id === overId);
      if (from < 0 || to < 0 || from === to) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      persist(withReindexed(list));
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

  return {
    projects,
    syncRoots,
    loading,
    saving,
    error,
    setError,
    reload,
    replaceAll,
    setSyncRoots,
    upsert,
    setArchived,
    reorder,
    toggleFavorite,
    setPriority,
    setCategory,
    setStatus,
  };
}
