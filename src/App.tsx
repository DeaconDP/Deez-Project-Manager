import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  addSyncRoot,
  checkPathsExist,
  importGithubRepos,
  importLocalFolders,
  importUnityHub,
  importVcc,
  openPath,
  openUnityProject,
  onGitSyncUpdated,
  openshipProjectStatus,
  openshipShip,
  pickProjectFolder,
  pickProjectFolders,
  refreshGithubStatuses,
  removeSyncRoot,
  runProject,
  syncAllParentFolders,
  syncParentFolder,
  updateLocalProject,
} from "./api";
import { ActionFeedback } from "./components/ActionFeedback";
import { AppChrome } from "./components/AppChrome";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ImportMenu, type ImportKind } from "./components/ImportMenu";
import { ListViewMenu } from "./components/ListViewMenu";
import { ProjectEditModal } from "./components/ProjectEditModal";
import { ProjectsSkeleton } from "./components/ProjectsSkeleton";
import { ProjectsTable } from "./components/ProjectsTable";
import { Spinner } from "./components/Spinner";
import { SyncMenu } from "./components/SyncMenu";
import { ZoomControls } from "./components/ZoomControls";
import { useAsyncAction } from "./hooks/useAsyncAction";
import { useMesh } from "./hooks/useMesh";
import { useProjects } from "./hooks/useProjects";
import { useAppTitle } from "./hooks/useAppTitle";
import { useUiZoom } from "./hooks/useUiZoom";
import type { TaskMutations } from "./hooks/useTasks";
import {
  MetricsChromeProvider,
  MetricsGlanceSlot,
  MetricsLiveSlot,
} from "./monitor/components/MetricsChrome";
import type { Project, ProjectStore } from "./types";
import {
  projectOnThisHost,
  withHostStamp,
} from "./types";
import { defaultDeviceName } from "./lib/mesh";
import "./App.css";
import "./monitor/monitor.css";

const KanbanBoard = lazy(() =>
  import("./components/KanbanBoard").then((m) => ({ default: m.KanbanBoard })),
);
const OverviewTab = lazy(() =>
  import("./monitor/components/OverviewTab").then((m) => ({
    default: m.OverviewTab,
  })),
);
const ProcessesHub = lazy(() =>
  import("./monitor/components/ProcessesHub").then((m) => ({
    default: m.ProcessesHub,
  })),
);
const FuelTab = lazy(() =>
  import("./monitor/components/FuelTab").then((m) => ({ default: m.FuelTab })),
);
const SettingsPanel = lazy(() =>
  import("./monitor/components/SettingsPanel").then((m) => ({
    default: m.SettingsPanel,
  })),
);

type ToolbarAction =
  | "refresh"
  | "prune"
  | ImportKind
  | "add"
  | "sync"
  | "sync-manage";
type RowBusy = {
  id: string;
  kind: "open" | "reveal" | "run" | "ship" | "promote" | "updateLocal" | "opsStatus";
};
type AppTab = "projects" | "overview" | "processes" | "fuel" | "settings";
type ProcessView = "cpu" | "network" | "usb" | "spikes";
type HostScope = "this" | "all";

const HOST_SCOPE_KEY = "deez-host-scope";

function readHostScope(): HostScope {
  try {
    return localStorage.getItem(HOST_SCOPE_KEY) === "all" ? "all" : "this";
  } catch {
    return "this";
  }
}

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
    applyMeshStore,
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
  const [hostScope, setHostScope] = useState<HostScope>(() => readHostScope());
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [boardProjectId, setBoardProjectId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [meshDirtyEpoch, setMeshDirtyEpoch] = useState(0);
  const wasSavingRef = useRef(false);

  useEffect(() => {
    if (wasSavingRef.current && !saving) {
      setMeshDirtyEpoch((n) => n + 1);
    }
    wasSavingRef.current = saving;
  }, [saving]);

  const handleMeshMerged = useCallback((store: ProjectStore) => {
    applyMeshStore(store);
  }, [applyMeshStore]);

  const mesh = useMesh({
    dirtyEpoch: meshDirtyEpoch,
    onStoreMerged: handleMeshMerged,
  });

  const boardProject = useMemo(
    () =>
      boardProjectId
        ? (projects.find((p) => p.id === boardProjectId) ?? null)
        : null,
    [boardProjectId, projects],
  );

  const thisHost =
    mesh.config?.deviceName?.trim() || defaultDeviceName();

  const filtered = useMemo(() => {
    let list = projects.filter((p) =>
      listView === "archive" ? p.archived : !p.archived,
    );
    if (hostScope === "this") {
      list = list.filter((p) => projectOnThisHost(p, thisHost));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
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
        p.host ?? "",
        p.siteId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search, listView, hostScope, thisHost]);

  // Stamp owning host onto local-path rows that still lack one.
  useEffect(() => {
    if (loading) return;
    let changed = false;
    const next = projects.map((p) => {
      const stamped = withHostStamp(p, thisHost);
      if (stamped !== p && stamped.host !== p.host) changed = true;
      return stamped;
    });
    if (changed) replaceAll(next);
  }, [loading, thisHost]); // eslint-disable-line react-hooks/exhaustive-deps -- one-shot heal per host label

  const archivedCount = useMemo(
    () => projects.filter((p) => p.archived).length,
    [projects],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void onGitSyncUpdated((update) => {
      applyGitSyncUpdate(update);
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyGitSyncUpdate]);

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void onGitSyncUpdated((update) => {
      applyGitSyncUpdate(update);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyGitSyncUpdate]);

  async function runToolbar(
    action: ToolbarAction,
    work: () => Promise<
      string | void | { message: string; persist?: boolean }
    >,
    messages?: {
      loading?: string;
      success?: string;
      persistSuccess?: boolean;
    },
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

  async function handleRefreshFolders() {
    await runToolbar(
      "prune",
      async () => {
        const withPaths = projects.filter(
          (p) => p.localPath != null && p.localPath.trim() !== "",
        );
        const paths = withPaths.map((p) => p.localPath!);
        const exists = await checkPathsExist(paths);
        const missing = withPaths
          .filter((_, i) => !exists[i])
          .map((p) => ({ id: p.id, localPath: p.localPath! }));
        if (missing.length === 0) {
          return "All project folders are available";
        }
        removeByIds(missing.map((m) => m.id));
        if (
          boardProjectId &&
          missing.some((m) => m.id === boardProjectId)
        ) {
          setBoardProjectId(null);
        }
        const pathList = missing.map((m) => m.localPath).join(", ");
        const n = missing.length;
        return {
          message: `Removed ${n} missing project folder${n === 1 ? "" : "s"}: ${pathList}`,
          persist: true,
        };
      },
      { loading: "Refreshing folders…" },
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

  async function handleShipPreview(project: Project) {
    const id = project.openshipProjectId?.trim();
    if (!id) {
      openAction.setFeedback({
        kind: "error",
        message: "Set OpenShip project id in Edit first.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "ship" });
    await openAction.run(
      async () => {
        const result = await openshipShip(id, "preview");
        if (!result.ok) throw new Error(result.message);
        return result.detail
          ? { message: `${result.message} — ${result.detail}`, persist: true }
          : result.message;
      },
      { loading: "Shipping Preview…" },
    );
    setRowBusy(null);
  }

  async function handlePromoteLive(project: Project) {
    const id = project.openshipProjectId?.trim();
    if (!id) {
      openAction.setFeedback({
        kind: "error",
        message: "Set OpenShip project id in Edit first.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "promote" });
    await openAction.run(
      async () => {
        const result = await openshipShip(id, "production");
        if (!result.ok) throw new Error(result.message);
        return result.detail
          ? { message: `${result.message} — ${result.detail}`, persist: true }
          : result.message;
      },
      { loading: "Promoting Live…" },
    );
    setRowBusy(null);
  }

  async function handleUpdateLocal(project: Project) {
    if (!project.localPath) {
      openAction.setFeedback({
        kind: "error",
        message: "Set a local path before Update Local.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "updateLocal" });
    await openAction.run(
      async () => {
        const result = await updateLocalProject(project.localPath!);
        if (!result.ok) throw new Error(result.message);
        if (result.lastBuildAt) {
          upsert({
            ...project,
            lastBuildAt: result.lastBuildAt,
            updatedAt: new Date().toISOString(),
          });
        }
        return { message: result.message, persist: true };
      },
      { loading: "Updating local…" },
    );
    setRowBusy(null);
  }

  async function handleOpsStatus(project: Project) {
    const id = project.openshipProjectId?.trim();
    if (!id) {
      openAction.setFeedback({
        kind: "error",
        message: "Set OpenShip project id in Edit first.",
      });
      return;
    }
    setRowBusy({ id: project.id, kind: "opsStatus" });
    await openAction.run(
      async () => {
        const result = await openshipProjectStatus(id);
        if (!result.ok) throw new Error(result.message);
        return {
          message: result.detail
            ? `${result.message}: ${result.detail.slice(0, 240)}`
            : result.message,
          persist: true,
        };
      },
      { loading: "Fetching OpenShip status…" },
    );
    setRowBusy(null);
  }

  async function handleOpenPreviewUrl(project: Project) {
    const url = project.previewUrl?.trim();
    if (!url) return;
    setRowBusy({ id: project.id, kind: "open" });
    await openAction.run(
      async () => {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      },
      { loading: "Opening Preview…", success: "Preview opened" },
    );
    setRowBusy(null);
  }

  async function handleOpenLiveUrl(project: Project) {
    const url = project.liveUrl?.trim();
    if (!url) return;
    setRowBusy({ id: project.id, kind: "open" });
    await openAction.run(
      async () => {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
      },
      { loading: "Opening Live…", success: "Live opened" },
    );
    setRowBusy(null);
  }

  const handleArchiveRequest = useCallback((project: Project) => {
    setArchiveTarget(project);
  }, []);

  function handleArchiveConfirm() {
    if (archiveTarget) {
      setArchived(archiveTarget.id, true);
      setArchiveTarget(null);
    }
  }

  const handleRestore = useCallback(
    (project: Project) => {
      setArchived(project.id, false);
    },
    [setArchived],
  );

  const onOpenBoard = useCallback((p: Project) => {
    setBoardProjectId(p.id);
  }, []);

  const openHandlersRef = useRef({
    open: handleOpen,
    run: handleRun,
    reveal: handleReveal,
    add: handleAddFolder,
    ship: handleShipPreview,
    promote: handlePromoteLive,
    updateLocal: handleUpdateLocal,
    opsStatus: handleOpsStatus,
    previewUrl: handleOpenPreviewUrl,
    liveUrl: handleOpenLiveUrl,
  });
  openHandlersRef.current = {
    open: handleOpen,
    run: handleRun,
    reveal: handleReveal,
    add: handleAddFolder,
    ship: handleShipPreview,
    promote: handlePromoteLive,
    updateLocal: handleUpdateLocal,
    opsStatus: handleOpsStatus,
    previewUrl: handleOpenPreviewUrl,
    liveUrl: handleOpenLiveUrl,
  };

  const onOpenProject = useCallback((p: Project) => {
    void openHandlersRef.current.open(p);
  }, []);
  const onRunProject = useCallback((p: Project) => {
    void openHandlersRef.current.run(p);
  }, []);
  const onRevealProject = useCallback((p: Project) => {
    void openHandlersRef.current.reveal(p);
  }, []);
  const onShipPreview = useCallback((p: Project) => {
    void openHandlersRef.current.ship(p);
  }, []);
  const onPromoteLive = useCallback((p: Project) => {
    void openHandlersRef.current.promote(p);
  }, []);
  const onUpdateLocal = useCallback((p: Project) => {
    void openHandlersRef.current.updateLocal(p);
  }, []);
  const onOpsStatus = useCallback((p: Project) => {
    void openHandlersRef.current.opsStatus(p);
  }, []);
  const onOpenPreviewUrl = useCallback((p: Project) => {
    void openHandlersRef.current.previewUrl(p);
  }, []);
  const onOpenLiveUrl = useCallback((p: Project) => {
    void openHandlersRef.current.liveUrl(p);
  }, []);
  const onAddFolder = useCallback(() => {
    void openHandlersRef.current.add();
  }, []);

  const importBusy: ImportKind | null =
    toolbarAction === "hub" ||
    toolbarAction === "vcc" ||
    toolbarAction === "github"
      ? toolbarAction
      : null;

  return (
    <MetricsChromeProvider preferSlow={tab === "projects"}>
    <div className="app-shell" data-layout={layout}>
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
                aria-label="Refresh git statuses"
                title="Refresh git statuses (then fetch remotes in background)"
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
              <Suspense fallback={<ProjectsSkeleton />}>
                <KanbanBoard
                  project={boardProject}
                  allTasks={tasks}
                  mutations={taskMutations}
                  onBack={() => setBoardProjectId(null)}
                />
              </Suspense>
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
                      <div
                        className="host-scope"
                        role="group"
                        aria-label="Host inventory"
                      >
                        <button
                          type="button"
                          className={`btn-secondary host-scope__btn${
                            hostScope === "this" ? " is-active" : ""
                          }`}
                          aria-pressed={hostScope === "this"}
                          title={`Show projects on this machine (${thisHost})`}
                          onClick={() => {
                            setHostScope("this");
                            try {
                              localStorage.setItem(HOST_SCOPE_KEY, "this");
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          This host
                        </button>
                        <button
                          type="button"
                          className={`btn-secondary host-scope__btn${
                            hostScope === "all" ? " is-active" : ""
                          }`}
                          aria-pressed={hostScope === "all"}
                          title="Show every host stamp (Update Local only works where the path lives)"
                          onClick={() => {
                            setHostScope("all");
                            try {
                              localStorage.setItem(HOST_SCOPE_KEY, "all");
                            } catch {
                              /* ignore */
                            }
                          }}
                        >
                          All hosts
                        </button>
                      </div>
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
                        className="btn-secondary"
                        disabled={toolbar.busy}
                        aria-busy={toolbarAction === "prune"}
                        onClick={() => void handleRefreshFolders()}
                      >
                        {toolbarAction === "prune" ? (
                          <span className="btn-busy-label">
                            <Spinner size="sm" />
                            Refreshing…
                          </span>
                        ) : (
                          "Refresh"
                        )}
                      </button>
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
                        : hostScope === "this"
                          ? "No projects on this host."
                          : "No projects yet."
                    }
                    emptyHint={
                      listView === "archive"
                        ? "Archived projects appear here and can be restored anytime."
                        : hostScope === "this"
                          ? "This machine only lists its own inventory. Switch Tailscale peer in Settings, or choose All hosts for pathless stamps from other boxes."
                          : "Add a local folder, Sync a parent, or import from Hub, VCC, or GitHub."
                    }
                    onAdd={listView === "active" ? onAddFolder : undefined}
                    addBusy={toolbarAction === "add"}
                    addDisabled={toolbar.busy}
                    onReorder={reorder}
                    onToggleFavorite={toggleFavorite}
                    onPriorityChange={setPriority}
                    onCategoryChange={setCategory}
                    onStatusChange={setStatus}
                    onOpenBoard={onOpenBoard}
                    onOpen={onOpenProject}
                    onRun={onRunProject}
                    onReveal={onRevealProject}
                    onEdit={setEditing}
                    onArchive={handleArchiveRequest}
                    onRestore={handleRestore}
                    onShipPreview={onShipPreview}
                    onPromoteLive={onPromoteLive}
                    onUpdateLocal={onUpdateLocal}
                    onOpsStatus={onOpsStatus}
                    onOpenPreviewUrl={onOpenPreviewUrl}
                    onOpenLiveUrl={onOpenLiveUrl}
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
            <Suspense fallback={<ProjectsSkeleton />}>
              <OverviewTab />
            </Suspense>
          </div>
        ) : null}

        {tab === "processes" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-processes"
            aria-labelledby="tab-processes"
          >
            <Suspense fallback={<ProjectsSkeleton />}>
              <ProcessesHub
                processView={processView}
                onProcessViewChange={setProcessView}
              />
            </Suspense>
          </div>
        ) : null}

        {tab === "fuel" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-fuel"
            aria-labelledby="tab-fuel"
          >
            <Suspense fallback={<ProjectsSkeleton />}>
              <FuelTab />
            </Suspense>
          </div>
        ) : null}

        {tab === "settings" ? (
          <div
            className="monitor-view tab-panel"
            role="tabpanel"
            id="panel-settings"
            aria-labelledby="tab-settings"
          >
            <Suspense fallback={<ProjectsSkeleton />}>
              <SettingsPanel mesh={mesh} />
            </Suspense>
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
    </MetricsChromeProvider>
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
