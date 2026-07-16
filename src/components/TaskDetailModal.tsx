import { useEffect, useId, useRef, useState } from "react";
import { KANBAN_COLUMNS, type KanbanColumn, type Priority, type Task } from "../types";
import { PrioritySelect } from "./PrioritySelect";
import { Spinner } from "./Spinner";

interface Props {
  task: Task | null;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Task>) => void;
  onAddComment: (body: string) => void | Promise<void>;
}

export function TaskDetailModal({
  task,
  open,
  busy = false,
  onClose,
  onSave,
  onAddComment,
}: Props) {
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Default");
  const [column, setColumn] = useState<KanbanColumn>("Backlog");
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setColumn(task.column);
      setComment("");
    }
  }, [open, task]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, task?.id]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !task) return null;

  async function submitComment() {
    const body = comment.trim();
    if (!body || commentBusy) return;
    setCommentBusy(true);
    try {
      await onAddComment(body);
      setComment("");
    } finally {
      setCommentBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal task-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id={titleId}>Task</h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">
          <label>
            Title
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim();
                if (t && t !== task.title) onSave({ title: t });
              }}
              disabled={busy}
            />
          </label>
          <div className="task-detail-meta">
            <label>
              Priority
              <PrioritySelect
                value={priority}
                optLabel
                label="Task priority"
                onChange={(p) => {
                  setPriority(p);
                  onSave({ priority: p });
                }}
                disabled={busy}
              />
            </label>
            <label>
              Column
              <select
                value={column}
                disabled={busy}
                onChange={(e) => {
                  const c = e.target.value as KanbanColumn;
                  setColumn(c);
                  onSave({ column: c });
                }}
              >
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={4}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== task.description) {
                  onSave({ description });
                }
              }}
            />
          </label>
          <section className="task-comments" aria-label="Comments">
            <h3>Comments</h3>
            {task.comments.length === 0 ? (
              <p className="task-comments-empty">No comments yet.</p>
            ) : (
              <ul className="task-comment-list">
                {task.comments.map((c) => (
                  <li key={c.id}>
                    <time dateTime={c.createdAt}>
                      {new Date(c.createdAt).toLocaleString()}
                    </time>
                    <p>{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="task-comment-compose">
              <label>
                <span className="sr-only">Add comment</span>
                <textarea
                  rows={2}
                  placeholder="Add a comment…"
                  value={comment}
                  disabled={commentBusy || busy}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={!comment.trim() || commentBusy || busy}
                aria-busy={commentBusy}
                onClick={() => void submitComment()}
              >
                {commentBusy ? (
                  <span className="btn-busy-label">
                    <Spinner size="sm" />
                    Adding…
                  </span>
                ) : (
                  "Add comment"
                )}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
