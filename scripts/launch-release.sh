#!/usr/bin/env bash
# Update repo, rebuild release .app when needed, then launch it.
# Rebuild when the app is missing, source is newer, or --rebuild is passed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

APP="$ROOT/src-tauri/target/release/bundle/macos/Deez Project Manager.app"
BIN="$ROOT/src-tauri/target/release/deez-project-manager"
APP_BIN="$APP/Contents/MacOS/deez-project-manager"
LOG="${TMPDIR:-/tmp}/deez-project-manager-launch.log"

REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --rebuild|-Rebuild) REBUILD=1 ;;
  esac
done

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"
}

die() {
  echo "$*" >&2
  log "fatal: $*"
  exit 1
}

update_repo() {
  if [ ! -d "$ROOT/.git" ]; then
    return 0
  fi
  if ! command -v git >/dev/null; then
    log "git not found; skip pull"
    return 0
  fi
  echo "Updating to latest..."
  log "git pull --ff-only started"
  if git pull --ff-only; then
    log "git pull succeeded"
  else
    echo "git pull skipped (local changes or no fast-forward). Continuing with local tree."
    log "git pull failed; continuing"
  fi
}

source_is_newer_than() {
  local ref="$1"
  local paths=()
  local p
  for p in \
    src \
    src-tauri/src \
    src-tauri/icons \
    src-tauri/capabilities \
    src-tauri/tauri.conf.json \
    src-tauri/Cargo.toml \
    src-tauri/Cargo.lock \
    package.json \
    package-lock.json \
    index.html \
    vite.config.ts \
    tsconfig.json \
    tsconfig.node.json
  do
    [ -e "$ROOT/$p" ] && paths+=("$ROOT/$p")
  done
  [ "${#paths[@]}" -gt 0 ] || return 1
  find "${paths[@]}" -type f -newer "$ref" 2>/dev/null | head -n 1 | grep -q .
}

release_pids() {
  {
    pgrep -f "$BIN" 2>/dev/null || true
    if [ -x "$APP_BIN" ]; then
      pgrep -f "$APP_BIN" 2>/dev/null || true
    fi
  } | sort -u | grep -v '^$' || true
}

require_cmd() {
  local name="$1"
  local msg="$2"
  command -v "$name" >/dev/null || die "$msg"
}

build_release() {
  require_cmd node "Node.js is required to rebuild. Install from https://nodejs.org"
  require_cmd cargo "Rust/Cargo is required to rebuild. Install from https://rustup.rs"

  xcode-select -p >/dev/null 2>&1 || die "Xcode Command Line Tools are required. Run: xcode-select --install"

  local rust_version rust_major rust_rest rust_minor
  rust_version="$(rustc --version | awk '{print $2}')"
  rust_major="${rust_version%%.*}"
  rust_rest="${rust_version#*.}"
  rust_minor="${rust_rest%%.*}"
  if [ "$rust_major" -lt 1 ] || { [ "$rust_major" -eq 1 ] && [ "$rust_minor" -lt 85 ]; }; then
    die "Rust 1.85 or newer is required (found $rust_version). Run: rustup update stable"
  fi

  if [ ! -d "$ROOT/node_modules" ]; then
    echo "Installing npm dependencies..."
    log "npm install started"
    npm install || die "npm install failed."
  fi

  echo "Building Deez Project Manager release app..."
  log "tauri build started"
  if ! npm run tauri build; then
    echo "tauri build failed."
    log "tauri build failed"
    return 1
  fi

  if [ ! -d "$APP" ] && [ ! -x "$BIN" ]; then
    echo "Build finished but app not found:"
    echo "  $APP"
    log "build finished but app missing"
    return 1
  fi

  log "tauri build succeeded"
  return 0
}

start_release() {
  local pids
  pids="$(release_pids)"
  if [ -n "$pids" ]; then
    echo "Deez Project Manager is already running."
    log "already running: pid(s) $(echo "$pids" | tr '\n' ' ')"
    return 0
  fi

  echo "Launching Deez Project Manager..."
  if [ -d "$APP" ]; then
    log "open app: $APP"
    open "$APP"
  elif [ -x "$BIN" ]; then
    log "start binary: $BIN"
    "$BIN" >/dev/null 2>&1 &
  else
    echo "No release app is available to launch."
    log "launch failed: nothing to start"
    return 1
  fi

  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.5
    pids="$(release_pids)"
    if [ -n "$pids" ]; then
      log "launch verified: pid(s) $(echo "$pids" | tr '\n' ' ')"
      return 0
    fi
  done

  # `open` can succeed while pgrep is still catching up; treat app presence as OK.
  if [ -d "$APP" ]; then
    log "launch assumed ok via open (pgrep timeout)"
    return 0
  fi

  echo "Release app was started, but no matching process stayed running."
  echo "Launch log: $LOG"
  log "launch verification failed"
  return 1
}

log "launcher start: rebuild=$REBUILD"

update_repo

APP_EXISTS=0
SOURCE_NEWER=0
if [ -d "$APP" ] || [ -x "$BIN" ]; then
  APP_EXISTS=1
  REF="$APP"
  [ -d "$APP" ] || REF="$BIN"
  if source_is_newer_than "$REF"; then
    SOURCE_NEWER=1
  fi
fi
log "after update: appExists=$APP_EXISTS sourceIsNewer=$SOURCE_NEWER"

if [ "$APP_EXISTS" -eq 1 ] && [ "$REBUILD" -eq 0 ] && [ "$SOURCE_NEWER" -eq 0 ]; then
  if start_release; then
    exit 0
  fi
  exit 1
fi

pids="$(release_pids)"
if [ -n "$pids" ]; then
  echo "Stopping running release app before rebuild..."
  log "stopping release pid(s) $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.5
  pids="$(release_pids)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
fi

if [ "$APP_EXISTS" -eq 0 ]; then
  echo "Release app missing - building..."
elif [ "$REBUILD" -eq 1 ]; then
  echo "Refresh requested - rebuilding release app..."
else
  echo "Source newer than release app - rebuilding before launch..."
  log "source newer; rebuild-first path"
fi

if ! build_release; then
  if [ -d "$APP" ] || [ -x "$BIN" ]; then
    echo "Rebuild failed; launching the existing release app instead."
    log "rebuild failed; fallback launch"
    start_release || true
    exit 1
  fi
  echo "No release app is available to launch."
  echo "Launch log: $LOG"
  exit 1
fi

if start_release; then
  exit 0
fi
exit 1