import { useEffect, useRef, useState } from "react";
import deezLogo from "../assets/deez-logo.png";

interface Props {
  title: string;
  onTitleChange: (next: string) => void;
  glanceSlot?: React.ReactNode;
  liveSlot?: React.ReactNode;
  refreshSlot: React.ReactNode;
  zoomSlot: React.ReactNode;
  saveSlot: React.ReactNode;
}

/** Slim top brand strip — brand + metrics glance + utilities. */
export function AppChrome({
  title,
  onTitleChange,
  glanceSlot,
  liveSlot,
  refreshSlot,
  zoomSlot,
  saveSlot,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [editing, title]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    if (skipCommitRef.current) {
      skipCommitRef.current = false;
      return;
    }
    onTitleChange(draft);
    setEditing(false);
  };

  const cancel = () => {
    skipCommitRef.current = true;
    setDraft(title);
    setEditing(false);
  };

  return (
    <header className="app-chrome">
      <div className="app-chrome-brand">
        <img
          className="brand-mark"
          src={deezLogo}
          alt=""
          width={32}
          height={32}
          aria-hidden
        />
        <div className="brand-text">
          {editing ? (
            <input
              ref={inputRef}
              className="brand-name brand-name-input"
              value={draft}
              aria-label="App title"
              maxLength={48}
              spellCheck={false}
              autoCapitalize="characters"
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancel();
                }
              }}
            />
          ) : (
            <h1 className="brand-name">
              <button
                type="button"
                className="brand-name-btn"
                onClick={() => setEditing(true)}
                title="Click to rename"
                aria-label={`App title: ${title}. Click to rename`}
              >
                {title}
              </button>
            </h1>
          )}
          <p className="brand-credits">
            made by{" "}
            <a
              href="https://deac.online"
              target="_blank"
              rel="noopener noreferrer"
            >
              deac.online
            </a>{" "}
            at{" "}
            <a
              href="https://worldbuild.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              worldbuild.io
            </a>
          </p>
        </div>
      </div>
      {glanceSlot ? (
        <div className="app-chrome-glance">{glanceSlot}</div>
      ) : null}
      <div className="app-chrome-utils">
        {liveSlot}
        {refreshSlot}
        {zoomSlot}
        {saveSlot}
      </div>
    </header>
  );
}
