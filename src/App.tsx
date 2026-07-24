import { useEffect, useMemo, useRef, useState } from "react";
import {
  addSyncRoot,
  importGithubRepos,
  importLocalFolders,
  importUnityHub,
  importVcc,
  openPath,
  openUnityProject,
  pickProjectFolder,
  pickProjectFolders,
  refreshGithubStatuses,
  removeSyncRoot,
  runProject,
  syncAllParentFolders,
  syncParentFolder,
} from "./api";
import { ActionFeedback } from "./components/ActionFeedback";
import { AppChrome } from "./components/AppChrome";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ImportMenu, type ImportKind } from "./components/ImportMenu";
import { KanbanBoard } from "./components/KanbanBoard";
import { ListViewMenu } from "./components/ListViewMenu";
import { ProjectEditModal } from "./components/ProjectEditModal";
import { ProjectsSkeleton } from "./components/ProjectsSkeleton";
import { ProjectsTable } from "./components/ProjectsTable";
import { Spinner } from "./components/Spinner";
import { SyncMenu } from "./components/SyncMenu";
import { ZoomControls } from "./components/ZoomControls";
import { useAsyncAction } from "./hooks/useAsyncAction";
import { useProjects } from "./hooks/useProjects";
import { useAppTitle } from "./hooks/useAppTitle";
import { useUiZoom } from "./hooks/useUiZoom";
import type { TaskMutations } from "./hooks/useTasks";
import {
  MetricsChromeProvider,
  MetricsGlanceSlot,
  MetricsLiveSlot,
} from "./monitor/components/MetricsChrome";
import { FuelTab } from "./monitor/components/FuelTab";
import { OverviewTab } from "./monitor/components/OverviewTab";
import { ProcessesHub } from "./monitor/components/ProcessesHub";
import { SettingsPanel } from "./monitor/components/SettingsPanel";
import type { Project } from "./types";
import "./App.css";
import "./monitor/monitor.css";

type ToolbarAction = "refresh" | ImportKind | "add" | "sync" | "sync-manage";
type RowBusy = { id: string; kind: "open" | "reveal" | "run" };
type AppTab = "projects" | "overview" | "processes" | "fuel" | "settings";
type ProcessView = "cpu" | "network" | "usb" | "spikes";

const APP_TABS: { id: AppTab; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "overview", label: "Overview" },
  { id: "processes", label: "Processes" },
  { id: "fuel", label: "Fuel" },
  { id: "settings", label: "Settings" },
];


function App() {
  const {
    projects,
    tasks,
    syncRoots,
    loading,
    saving,
    error,
    setError,
    replaceAll,
    setSyncRoots,
    upsert,
    setArchived,
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
  } = useProjects();

  const taskMutations: TaskMutations = useMemo(
    () => ({
      addTask,
      updateTask,
      moveTask,
      addTaskComment,
      importTrelloTasks,
    }),
    [addTask, updateTask, moveTask, addTaskComment, importTrelloTasks],
  );

  const toolbar = useAsyncAction();
  const openAction = useAsyncAction();
  const {
    zoom,
    layout,
    zoomIn,
    zoomOut,
    reset: resetZoom,
    canZoomIn,
    canZoomOut,
  } = useUiZoom();
  const { title: appTitle, setTitle: setAppTitle } = useAppTitle();
  const [tab, setTab] = useState<AppTab>("projects");
  const [processView, setProcessView] = useState<ProcessView>("cpu");
  const [toolbarAction, setToolbarAction] = useState<ToolbarAction | null>(
    null,
  );
  const [rowBusy, setRowBusy] = useState<RowBusy | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [listView, setListView] = useState<"active" | "archive">("active");
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [boardProjectId, setBoardProjectId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const boardProject = useMemo(
    () =>
      boardProjectId
        ? (projects.find((p) => p.id === boardProjectId) ?? null)
        : null,
    [boardProjectId, projects],
  );

  const filtered = useMemo(() => {
    const byArchive = projects.filter((p) =>
      listView === "archive" ? p.archived : !p.archived,
    );
    const q = search.trim().toLowerCase();
    if (!q) return byArchive;
    return byArchive.filter((p) => {
      const hay = [
        p.name,
        p.platform,
        p.category,
        p.location,
        p.localPath ?? "",
        p.githubRepo ?? "",
        p.priority,
        p.agency ?? "",
        p.client ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search, listView]);

  const archivedCount = useMemo(
    () => projects.filter((p) => p.archived).length,
    [projects],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editingField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;

      if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) && !editingField) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function runToolbar(
    action: ToolbarAction,
    work: () => Promise<string | void>,
    messages?: { loading?: string; success?: string },
  ) {
    setToolbarAction(action);
    try {
      await toolbar.run(work, messages);
    } finally {
      setToolbarAction(null);
    }
  }

  async function handleAddFolder() {
    await runToolbar(
      "add",
      async () => {
        const paths = await pickProjectFolders();
        if (!paths?.length) {
          return "__cancel__";
        }
        const result = await importLocalFolders(paths);
        replaceAll(result.projects);
        return formatImportSummary(result);
      },
      { loading: "Adding project(s)…" },
    );
  }

  async function handleImportGithub() {
    await runToolbar(
      "github",
      async () => {
        const result = await importGithubRepos("DeaconDP");
        replaceAll(result.projects);
        return formatImportSummary(result);
      },
      { loading: "Importing from GitHub…" },
    );
  }

  async function handleImportUnityHub() {
    await runToolbar(
      "hub",
      async () => {
        const result = await importUnityHub();
        replaceAll(result.projects);
        return formatImportSummary(result);
      },
      { loading: "Importing from Unity Hub…" },
    );
  }

  async function handleImportVcc() {
    await runToolbar(
      "vcc",
      async () => {
        const result = await importVcc();
        replaceAll(result.projects);
        return formatImportSummary(result);
      },
      { loading: "Importing from VCC…" },
    );
  }

  async function handleSyncAllParents() {
    await runToolbar(
      "sync",
      async () => {
        const result = await syncAllParentFolders();
        replaceAll(result.projects);
        return formatImportSummary(result);
      },
      { loading: "Syncing all parent folders…" },
    );
  }

  async function handleSyncParent(path: string) {
    await runToolbar(
      "sync",
      async () => {
        const result = await syncParentFolder(path);
        replaceAll(result.projects);
        return formatImportSummary(result);
      },
      { loading: "Syncing parent folder…" },
    );
  }

  async function handleAddSyncRoot() {
    await runToolbar(
      "sync-manage",
      async () => {
        const path = await pickProjectFolder();
        if (!path) {
          return "__cancel__";
        }
        const roots = await addSyncRoot(path);
        setSyncRoots(roots);
        return "Parent folder added";
      },
      { loading: "Adding parent folder…" },
    );
  }

  async function handleRemoveSyncRoot(path: string) {
    await runToolbar(
      "sync-manage",
      async () => {
        const roots = await removeSyncRoot(path);
        setSyncRoots(roots);
        return "Parent folder removed";
      },
      { loading: "Removing parent folder…" },
    );
  }

  async function handleRefreshStatuses() {
    await runToolbar(
      "refresh",
      async () => {
        const next = await refreshGithubStatuses();
        replaceAll(next);
      },
      { loading: "Refreshing projects…", success: "Projects updated" },
    );
  }

  async function handleOpen(project: Project) {
    if (!project.localPath) {
      openAction.setFeedback({
        kind: "error",
        message: "Set a local path before opening.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "open" });
    await openAction.run(
      async () => {
        const path = project.localPath!;
        if (project.platform === "Unity" || project.unityVersion) {
          try {
            await openUnityProject(path, project.unityVersion);
            return;
          } catch {
            // fall through to folder
          }
        }
        await openPath(path);
      },
      { loading: "Opening…", success: "Opened" },
    );
    setRowBusy(null);
  }

  async function handleRun(project: Project) {
    if (!project.localPath) {
      openAction.setFeedback({
        kind: "error",
        message: "Set a local path before running.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "run" });
    await openAction.run(
      async () => {
        await runProject(project.localPath!);
      },
      { loading: "Starting…", success: "Running" },
    );
    setRowBusy(null);
  }

  async function handleReveal(project: Project) {
    if (!project.localPath) {
      openAction.setFeedback({
        kind: "error",
        message: "No local path to reveal.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "reveal" });
    await openAction.run(
      async () => {
        await openPath(project.localPath!);
      },
      { loading: "Revealing…", success: "Opened in file manager" },
    );
    setRowBusy(null);
  }

  function handleArchiveRequest(project: Project) {
    setArchiveTarget(project);
  }

  function handleArchiveConfirm() {
    if (archiveTarget) {
      setArchived(archiveTarget.id, true);
      setArchiveTarget(null);
    }
  }

  function handleRestore(project: Project) {
    setArchived(project.id, false);
  }

  const importBusy: ImportKind | null =
    toolbarAction === "hub" ||
    toolbarAction === "vcc" ||
    toolbarAction === "github"
      ? toolbarAction
      : null;

  return (
    <div className="app-shell" data-layout={layout}>
      <MetricsChromeProvider>
        <AppChrome
          title={appTitle}
          onTitleChange={setAppTitle}
          glanceSlot={<MetricsGlanceSlot />}
          liveSlot={<MetricsLiveSlot />}
          refreshSlot={
            tab === "projects" ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => void handleRefreshStatuses()}
                disabled={toolbar.busy}
                aria-busy={toolbarAction === "refresh"}
                aria-label="Refresh GitHub statuses"
                title="Refresh GitHub statuses"
              >
                {toolbarAction === "refresh" ? <Spinner size="sm" /> : "↻"}
              </button>
            ) : null
          }
          zoomSlot={
            <ZoomControls
              zoom={zoom}
              canZoomIn={canZoomIn}
              canZoomOut={canZoomOut}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onReset={resetZoom}
            />
          }
          saveSlot={
            saving ? (
              <span className="save-pill is-busy" aria-live="polite">
                <Spinner size="sm" />
                Saving…
              </span>
            ) : null
          }
        />
      </MetricsChromeProvider>

      <nav className="app-tabs" role="tablist" aria-label="Sections">
        {APP_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            className={tab === t.id ? "app-tab is-active" : "app-tab"}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => {
              setTab(t.id);
              if (t.id !== "projects") setBoardProjectId(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const i = APP_TABS.findIndex((x) => x.id === tab);
              const next =
                e.key === "ArrowRight"
                  ? APP_TABS[(i + 1) % APP_TABS.length]
                  : APP_TABS[(i - 1 + APP_TABS.length) % APP_TABS.length];
              setTab(next.id);
              if (next.id !== "projects") setBoardProjectId(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main
        className={
          tab === "projects" ? "main" : "main main--monitor"
        }
      >
        {tab === "projects" ? (
          <div
            className="tab-panel"
            role="tabpanel"
            id="panel-projects"
            aria-labelledby="tab-projects"
          >
            {boardProject ? (
              <KanbanBoard
                project={boardProject}
                allTasks={tasks}
                mutations={taskMutations}
                onBack={() => setBoardProjectId(null)}
              />
            ) : (
              <>
                <header className="page-header">
                  <div className="toolbar command-bar">
                    <label className="search-field">
                      <span className="sr-only">Search projects</span>
                      <input
                        ref={searchRef}
                        type="search"
                        placeholder="Search projects… (/)"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <div className="toolbar-actions">
                      <ListViewMenu
                        value={listView}
                        archivedCount={archivedCount}
                        onChange={setListView}
                      />
                      <SyncMenu
                        roots={syncRoots}
                        busy={toolbar.busy}
                        syncing={toolbarAction === "sync"}
                        disabled={toolbar.busy}
                        onSyncAll={() => void handleSyncAllParents()}
                        onSync={(path) => void handleSyncParent(path)}
                        onAddRoot={() => void handleAddSyncRoot()}
                        onRemoveRoot={(path) =>
                          void handleRemoveSyncRoot(path)
                        }
                      />
                      <ImportMenu
                        busy={toolbar.busy}
                        busyKind={importBusy}
                        disabled={toolbar.busy}
                        onImportHub={() => void handleImportUnityHub()}
                        onImportVcc={() => void handleImportVcc()}
                        onImportGithub={() => void handleImportGithub()}
                      />
                      <button
                        type="button"
                        className="btn-primary toolbar-add"
                        disabled={toolbar.busy}
                        aria-busy={toolbarAction === "add"}
                        onClick={() => void handleAddFolder()}
                      >
                        {toolbarAction === "add" ? (
                          <span className="btn-busy-label">
                            <Spinner size="sm" />
                            Adding…
                          </span>
                        ) : (
                          "+ Add project"
                        )}
                      </button>
                    </div>
                  </div>
                </header>

                <ActionFeedback
                  feedback={
                    toolbar.feedback.kind !== "idle"
                      ? toolbar.feedback
                      : openAction.feedback
                  }
                  onDismiss={() => {
                    toolbar.clear();
                    openAction.clear();
                    setError(null);
                  }}
                />
                {error && (
                  <div className="feedback feedback-error" role="alert">
                    {error}
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setError(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {loading ? (
                  <ProjectsSkeleton />
                ) : (
                  <ProjectsTable
                    projects={filtered}
                    layout={layout}
                    busyId={rowBusy?.id ?? null}
                    busyAction={rowBusy?.kind ?? null}
                    archivedView={listView === "archive"}
                    emptyMessage={
                      listView === "archive"
                        ? "No archived projects."
                        : "No projects yet."
                    }
                    emptyHint={
                      listView === "archive"
                        ? "Archived projects appear here and can be restored anytime."
                        : "Add a local folder, Sync a parent, or import from Hub, VCC, or GitHub."
                    }
                    onAdd={
                      listView === "active"
                        ? () => void handleAddFolder()
                        : undefined
                    }
                    addBusy={toolbarAction === "add"}
                    addDisabled={toolbar.busy}
                    onReorder={reorder}
                    onToggleFavorite={toggleFavorite}
                    onPriorityChange={setPriority}
                    onCategoryChange={setCategory}
                    onStatusChange={setStatus}
                    onOpenBoard={(p) => setBoardProjectId(p.id)}
                    onOpen={(p) => void handleOpen(p)}
                    onRun={(p) => void handleRun(p)}
                    onReveal={(p) => void handleReveal(p)}
                    onEdit={setEditing}
                    onArchive={handleArchiveRequest}
                    onRestore={handleRestore}
                  />
                )}
              </>
            )}
          </div>
        ) : null}

        {tab === "overview" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
          >
            <OverviewTab />
          </div>
        ) : null}

        {tab === "processes" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-processes"
            aria-labelledby="tab-processes"
          >
            <ProcessesHub
              processView={processView}
              onProcessViewChange={setProcessView}
            />
          </div>
        ) : null}

        {tab === "fuel" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-fuel"
            aria-labelledby="tab-fuel"
          >
            <FuelTab />
          </div>
        ) : null}

        {tab === "settings" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-settings"
            aria-labelledby="tab-settings"
          >
            <SettingsPanel />
          </div>
        ) : null}
      </main>

      <ProjectEditModal
        open={!!editing}
        project={editing}
        onClose={() => setEditing(null)}
        onSave={upsert}
      />

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive project"
        body={
          archiveTarget
            ? `Move “${archiveTarget.name}” to archive? Files on disk are not deleted.`
            : ""
        }
        confirmLabel="Archive"
        danger
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

export default App;

function formatImportSummary(result: {
  added: number;
  skipped: number;
  updated?: number;
}): string {
  const updated = result.updated ?? 0;
  const parts = [
    `Added ${result.added}`,
    updated > 0 ? `linked ${updated}` : null,
    `skipped ${result.skipped}`,
  ].filter(Boolean);
  return parts.join(", ");
}
