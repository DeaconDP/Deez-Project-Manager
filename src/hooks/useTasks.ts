import { useCallback, useMemo } from "react";
import { tasksForProject } from "../lib/kanban";
import type {
  KanbanColumn,
  Priority,
  Task,
  TrelloImportResult,
} from "../types";

export interface TaskMutations {
  addTask: (
    projectId: string,
    input: { title: string; priority?: Priority; column?: KanbanColumn },
  ) => Task | null;
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  moveTask: (taskId: string, toColumn: KanbanColumn, toIndex: number) => void;
  addTaskComment: (taskId: string, body: string) => void;
  importTrelloTasks: (projectId: string, rawJson: string) => TrelloImportResult;
}

/** Project-scoped view over store tasks + mutations (single save path via useProjects). */
export function useTasks(
  allTasks: Task[],
  projectId: string,
  mutations: TaskMutations,
) {
  const tasks = useMemo(
    () => tasksForProject(allTasks, projectId),
    [allTasks, projectId],
  );

  const addTask = useCallback(
    (input: { title: string; priority?: Priority; column?: KanbanColumn }) =>
      mutations.addTask(projectId, input),
    [mutations, projectId],
  );

  const importTrello = useCallback(
    (rawJson: string) => mutations.importTrelloTasks(projectId, rawJson),
    [mutations, projectId],
  );

  return {
    tasks,
    addTask,
    updateTask: mutations.updateTask,
    moveTask: mutations.moveTask,
    addTaskComment: mutations.addTaskComment,
    importTrello,
  };
}
