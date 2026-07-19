import { useEffect, useId, useRef, useState } from "react";
import { pickProjectFolder } from "../api";
import {
  normalizeCategory,
  normalizeStatus,
  PLATFORMS,
  type Platform,
  type Project,
} from "../types";
import { CategorySelect } from "./CategorySelect";
import { ConfirmDialog } from "./ConfirmDialog";
import { PrioritySelect } from "./PrioritySelect";
import { StatusSelect } from "./StatusSelect";
import { Spinner } from "./Spinner";

interface Props {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onSave: (project: Project) => void;
}

export function ProjectEditModal({ project, open, onClose, onSave }: Props) {
  const titleId = useId();
  const pathErrorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Project | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [dirtyConfirm, setDirtyConfirm] = useState(false);
  const [pickingPath, setPickingPath] = useState(false);
  const draftRef = useRef<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const dirtyConfirmRef = useRef(false);

  useEffect(() => {
    if (open && project) {
      const next = {
        ...project,
        category: normalizeCategory(project.category),
        status: normalizeStatus(project.status),
      };
      setDraft(next);
      draftRef.current = next;
      projectRef.current = project;
      setNameError(null);
      setPathError(null);
      setDirtyConfirm(false);
    }
  }, [open, project]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    dirtyConfirmRef.current = dirtyConfirm;
  }, [dirtyConfirm]);

  useEffect(() => {
    if (!open || !draft) return;
    const t = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, draft?.id]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (dirtyConfirmRef.current) return;
      e.preventDefault();
      const d = draftRef.current;
      const p = projectRef.current;
      if (d && p && JSON.stringify(d) !== JSON.stringify(p)) {
        setDirtyConfirm(true);
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !draft || !project) return null;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(project);

  function update<K extends keyof Project>(key: K, value: Project[K]) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, [key]: value };
      draftRef.current = next;
      return next;
    });
  }

  function requestClose() {
    if (isDirty) {
      setDirtyConfirm(true);
      return;
    }
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const current = draftRef.current;
    if (!current) return;
    if (!current.name.trim()) {
      setNameError("Name is required.");
      nameRef.current?.focus();
      return;
    }
    onSave({
      ...current,
      name: current.name.trim(),
      updatedAt: new Date().toISOString(),
    });
    onClose();
  }

  async function handlePickPath() {
    setPickingPath(true);
    setPathError(null);
    try {
      const path = await pickProjectFolder();
      if (path) {
        update("localPath", path);
      }
    } catch (error) {
      setPathError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickingPath(false);
    }
  }

  return (
    <>
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={requestClose}
      >
        <div
          className="modal edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id={titleId}>Edit project</h2>
            <button
              type="button"
              className="btn-ghost"
              onClick={requestClose}
              aria-label="Close"
            >
              ✕
            </button>
          </header>
          <form className="modal-body" onSubmit={handleSubmit} noValidate>
            <fieldset className="form-section">
              <legend>Identity</legend>
              <label>
                Name
                <input
                  ref={nameRef}
                  value={draft.name}
                  onChange={(e) => {
                    update("name", e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  required
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? "name-error" : undefined}
                />
                {nameError && (
                  <span id="name-error" className="field-error" role="alert">
                    {nameError}
                  </span>
                )}
              </label>
              <div className="form-row">
                <label>
                  Priority
                  <PrioritySelect
                    value={draft.priority}
                    label={`Priority ${draft.priority}`}
                    onChange={(priority) => update("priority", priority)}
                  />
                </label>
                <label>
                  Platform
                  <select
                    value={draft.platform}
                    onChange={(e) =>
                      update("platform", e.target.value as Platform)
                    }
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="form-section">
              <legend>Classification</legend>
              <div className="form-row">
                <label>
                  Status
                  <StatusSelect
                    value={normalizeStatus(draft.status)}
                    label={`Status ${normalizeStatus(draft.status)}`}
                    onChange={(status) => update("status", status)}
                  />
                </label>
                <label>
                  Category
                  <CategorySelect
                    value={normalizeCategory(draft.category)}
                    label={`Category ${normalizeCategory(draft.category)}`}
                    onChange={(category) => update("category", category)}
                  />
                </label>
              </div>
              <label>
                Location
                <input
                  value={draft.location}
                  onChange={(e) => update("location", e.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="form-section">
              <legend>Paths</legend>
              <label>
                Local path
                <div className="path-row">
                  <input
                    value={draft.localPath ?? ""}
                    onChange={(e) =>
                      update("localPath", e.target.value.trim() || null)
                    }
                    placeholder="/path/to/project"
                    aria-describedby={pathError ? pathErrorId : undefined}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pickingPath}
                    aria-busy={pickingPath}
                    onClick={() => void handlePickPath()}
                  >
                    {pickingPath ? (
                      <span className="btn-busy-label">
                        <Spinner size="sm" />
                        …
                      </span>
                    ) : (
                      "Browse…"
                    )}
                  </button>
                </div>
                {pathError ? (
                  <span id={pathErrorId} className="field-error" role="alert">
                    {pathError}
                  </span>
                ) : null}
              </label>
              <label>
                GitHub URL
                <input
                  value={draft.githubUrl ?? ""}
                  onChange={(e) => {
                    const url = e.target.value.trim() || null;
                    update("githubUrl", url);
                    if (url) {
                      const m = url.match(/github\.com[/:]([^/]+\/[^/.]+)/i);
                      update(
                        "githubRepo",
                        m ? m[1].replace(/\.git$/, "") : draft.githubRepo,
                      );
                      if (
                        !draft.githubStatus ||
                        draft.githubStatus === "none"
                      ) {
                        update("githubStatus", "remote-only");
                      }
                    } else {
                      update("githubRepo", null);
                      update("githubStatus", "none");
                    }
                  }}
                  placeholder="https://github.com/…"
                />
              </label>
            </fieldset>

            <fieldset className="form-section">
              <legend>Context</legend>
              <div className="form-row">
                <label>
                  Agency
                  <input
                    value={draft.agency ?? ""}
                    onChange={(e) =>
                      update("agency", e.target.value || undefined)
                    }
                  />
                </label>
                <label>
                  Client
                  <input
                    value={draft.client ?? ""}
                    onChange={(e) =>
                      update("client", e.target.value || undefined)
                    }
                  />
                </label>
                <label>
                  Year
                  <input
                    type="number"
                    value={draft.year ?? ""}
                    onChange={(e) =>
                      update(
                        "year",
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  rows={3}
                  value={draft.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </label>
            </fieldset>

            <footer className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={requestClose}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </footer>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={dirtyConfirm}
        title="Discard changes?"
        body="You have unsaved edits. Close without saving?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        danger
        onConfirm={() => {
          setDirtyConfirm(false);
          onClose();
        }}
        onCancel={() => setDirtyConfirm(false)}
      />
    </>
  );
}
