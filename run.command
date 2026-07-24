#!/bin/bash
cd "$(dirname "$0")"
ROOT="$(pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

SESSION="deez-pm"

command -v node >/dev/null || {
  echo "Node.js is required. Install from https://nodejs.org"
  read -r
  exit 1
}

command -v cargo >/dev/null || {
  echo "Rust/Cargo is required for Tauri. Install from https://rustup.rs"
  read -r
  exit 1
}

xcode-select -p >/dev/null 2>&1 || {
  echo "Xcode Command Line Tools are required for Tauri on macOS."
  echo "Run: xcode-select --install"
  read -r
  exit 1
}

rust_version="$(rustc --version | awk '{print $2}')"
rust_major="${rust_version%%.*}"
rust_rest="${rust_version#*.}"
rust_minor="${rust_rest%%.*}"
if [ "$rust_major" -lt 1 ] || { [ "$rust_major" -eq 1 ] && [ "$rust_minor" -lt 85 ]; }; then
  echo "Rust 1.85 or newer is required (found $rust_version)."
  echo "Run: rustup update stable"
  read -r
  exit 1
fi

if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/vite ] || [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Installing npm dependencies..."
  npm install || {
    echo "npm install failed."
    read -r
    exit 1
  }
fi

start_app() {
  echo "Starting Deez Project Manager desktop app..."
  echo "Vite (internal): http://127.0.0.1:5187"
  echo "Do NOT open that URL in a browser — use the Deez Project Manager window that opens."
  echo
  npm run tauri dev
  status=$?
  if [ $status -ne 0 ]; then
    echo
    echo "Deez Project Manager failed to start."
    read -r
    exit $status
  fi
}

# Already inside this session (or any tmux) — run in the foreground pane.
if [ -n "${TMUX:-}" ]; then
  start_app
  exit $?
fi

if ! command -v tmux >/dev/null; then
  echo "tmux not found — running in this terminal (install with: brew install tmux)."
  echo
  start_app
  exit $?
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  # Alive = Vite still serving or the desktop binary is running.
  if lsof -iTCP:5187 -sTCP:LISTEN >/dev/null 2>&1 \
    || pgrep -f '[d]eez-project-manager' >/dev/null 2>&1; then
    echo "Attaching to existing tmux session '$SESSION'..."
    echo "Vite (internal): http://127.0.0.1:5187"
    exec tmux attach-session -t "$SESSION"
  fi
  echo "Existing session '$SESSION' is idle (app not running) — restarting..."
  tmux kill-session -t "$SESSION" 2>/dev/null || true
fi

echo "Starting Deez Project Manager in tmux session '$SESSION'..."
echo "Vite (internal): http://127.0.0.1:5187"
echo "Do NOT open that URL in a browser — use the Deez Project Manager window that opens."
echo "Reattach later with: tmux attach -t $SESSION"
echo

# Keep the session after exit so logs stay visible until you detach/kill.
exec tmux new-session -s "$SESSION" -c "$ROOT" \
  "npm run tauri dev; status=\$?; echo; if [ \$status -ne 0 ]; then echo 'Deez Project Manager failed to start.'; fi; echo \"[tmux:$SESSION] exited \$status — press Enter to close\"; read -r; exit \$status"
