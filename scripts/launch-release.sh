#!/usr/bin/env bash
# Update repo, rebuild release .app when needed, then launch it.
# Rebuild when the app is missing, source is newer, or --rebuild is passed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

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

write_status() {
  local message="$1"
  local progress="${2:-null}"
  [ -n "${LAUNCH_STATUS_FILE:-}" ] || return 0
  python3 - "$message" "$progress" "$LAUNCH_STATUS_FILE" <<'PY' 2>/dev/null || true
import json, sys
message, progress, path = sys.argv[1:4]
payload = {"message": message, "progress": None if progress == "null" else float(progress), "done": False, "error": False}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle)
PY
}

notify() {
  local message="$1"
  local progress="${2:-null}"
  log "$message"
  if [ -n "${LAUNCH_STATUS_FILE:-}" ]; then
    write_status "$message" "$progress"
  else
    echo "$message"
  fi
}

die() {
  notify "$*" "" >/dev/null 2>&1 || true
  echo "$*" >&2
  log "fatal: $*"
  exit 1
}

BUILD_PROGRESS_PID=""
BUILD_PROGRESS_FLAG=""

start_build_progress() {
  [ -n "${LAUNCH_STATUS_FILE:-}" ] || return 0
  BUILD_PROGRESS_FLAG="${LAUNCH_STATUS_FILE}.building"
  touch "$BUILD_PROGRESS_FLAG"
  (
    local p=20
    while [ -f "$BUILD_PROGRESS_FLAG" ]; do
      write_status "Building release app…" "$p"
      if [ "$p" -lt 85 ]; then
        p=$((p + 1))
      fi
      sleep 3
    done
  ) &
  BUILD_PROGRESS_PID=$!
}

stop_build_progress() {
  [ -n "$BUILD_PROGRESS_FLAG" ] || return 0
  rm -f "$BUILD_PROGRESS_FLAG"
  if [ -n "$BUILD_PROGRESS_PID" ]; then
    kill "$BUILD_PROGRESS_PID" 2>/dev/null || true
    wait "$BUILD_PROGRESS_PID" 2>/dev/null || true
  fi
  BUILD_PROGRESS_PID=""
  BUILD_PROGRESS_FLAG=""
}

update_repo() {
  if [ ! -d "$ROOT/.git" ]; then
    return 0
  fi
  if ! command -v git >/dev/null; then
    log "git not found; skip pull"
    return 0
  fi
  notify "Updating to latest…" 10
  log "git pull --ff-only started"
  if git pull --ff-only; then
    log "git pull succeeded"
  else
    notify "Continuing with local copy…" 15
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

install_npm_dependencies() {
  require_cmd node "Node.js is required. Install from https://nodejs.org"
  notify "Installing npm dependencies…" 18
  log "npm install started"
  npm install || die "npm install failed."
  notify "Dependencies ready." 22
  log "npm install succeeded"
}

# Cargo embeds absolute OUT_DIR paths in target/. After moving the repo,
# those paths break Tauri permission lookup. Purge when foreign paths are found.
purge_stale_cargo_target() {
  local result sample
  result="$(python3 - "$ROOT" <<'PY' 2>/dev/null || true
import json, os, sys, time
root = sys.argv[1]
target_root = os.path.join(root, "src-tauri", "target")
expected_prefix = target_root + os.sep
stale_hits = 0
sample = ""
if os.path.isdir(target_root):
    for dirpath, _, filenames in os.walk(target_root):
        for name in filenames:
            if name not in ("output", "root-output"):
                continue
            path = os.path.join(dirpath, name)
            try:
                text = open(path, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for line in text.splitlines():
                value = line.split("=", 1)[-1].strip()
                if not value.startswith("/"):
                    continue
                if "Deez-Project-Manager" not in value and "src-tauri/target" not in value:
                    continue
                if not value.startswith(expected_prefix):
                    stale_hits += 1
                    if not sample:
                        sample = value
                    break
payload = {
    "sessionId": "581201",
    "runId": "post-fix",
    "hypothesisId": "H1",
    "location": "launch-release.sh:purge_stale_cargo_target",
    "message": "stale cargo target scan",
    "data": {"root": root, "staleHits": stale_hits, "sample": sample[:300]},
    "timestamp": int(time.time() * 1000),
}
for log_path in (
    "/Users/epic/Desktop/Projects/Bot Projects/Cursor/Deez-Project-Manager/.cursor/debug-581201.log",
    os.path.join(root, ".cursor", "debug-581201.log"),
):
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")
    except OSError:
        pass
print(f"{stale_hits}\t{sample}")
PY
)"
  sample="${result#*$'\t'}"
  local stale_hits="${result%%$'\t'*}"
  [ -n "$stale_hits" ] || return 0
  [ "$stale_hits" -gt 0 ] 2>/dev/null || return 0

  notify "Clearing stale build cache (project moved)…" 28
  log "stale cargo target paths detected ($stale_hits); sample=$sample"
  log "cargo clean started"
  (cd "$ROOT/src-tauri" && cargo clean) || die "cargo clean failed after project move."
  log "cargo clean succeeded"
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

  purge_stale_cargo_target

  notify "Building release app…" 25
  log "tauri build started"
  start_build_progress
  local build_out build_status
  build_out="$(mktemp "${TMPDIR:-/tmp}/deez-pm-build.XXXXXX")"
  set +e
  npm run tauri build >"$build_out" 2>&1
  build_status=$?
  set -e
  cat "$build_out" >>"$LOG"
  if [ "$build_status" -ne 0 ]; then
    stop_build_progress
    # #region agent log
    python3 - "$ROOT" "$build_out" <<'PY' 2>/dev/null || true
import json, os, re, sys, time
root, out_path = sys.argv[1:3]
try:
    text = open(out_path, encoding="utf-8", errors="ignore").read()
except OSError:
    text = ""
err_line = ""
for line in text.splitlines():
    if "failed to read" in line or "No such file" in line or "Error failed" in line:
        err_line = line.strip()
        break
old_refs = len(re.findall(r"Bot Projects/Cursor/Deez-Project-Manager", text))
payload = {
    "sessionId": "581201",
    "runId": "post-fix",
    "hypothesisId": "H1",
    "location": "launch-release.sh:build_release:fail",
    "message": "tauri build failed",
    "data": {
        "root": root,
        "oldPathRefsInOutput": old_refs,
        "errorLine": err_line[:500],
        "exitCode": 1,
    },
    "timestamp": int(time.time() * 1000),
}
for log_path in (
    "/Users/epic/Desktop/Projects/Bot Projects/Cursor/Deez-Project-Manager/.cursor/debug-581201.log",
    os.path.join(root, ".cursor", "debug-581201.log"),
):
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")
    except OSError:
        pass
PY
    # #endregion
    rm -f "$build_out"
    notify "Build failed." 25
    log "tauri build failed"
    return 1
  fi
  rm -f "$build_out"
  stop_build_progress

  if [ ! -d "$APP" ] && [ ! -x "$BIN" ]; then
    log "build finished but app missing: $APP"
    return 1
  fi

  # #region agent log
  python3 - "$ROOT" <<'PY' 2>/dev/null || true
import json, os, sys, time
root = sys.argv[1]
payload = {
    "sessionId": "581201",
    "runId": "post-fix",
    "hypothesisId": "H1",
    "location": "launch-release.sh:build_release:ok",
    "message": "tauri build succeeded",
    "data": {"root": root},
    "timestamp": int(time.time() * 1000),
}
for log_path in (
    "/Users/epic/Desktop/Projects/Bot Projects/Cursor/Deez-Project-Manager/.cursor/debug-581201.log",
    os.path.join(root, ".cursor", "debug-581201.log"),
):
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")
    except OSError:
        pass
PY
  # #endregion
  notify "Build complete." 90
  log "tauri build succeeded"
  return 0
}

start_release() {
  local pids
  pids="$(release_pids)"
  if [ -n "$pids" ]; then
    notify "Already running — focusing app…" 95
    log "already running: pid(s) $(echo "$pids" | tr '\n' ' ')"
    return 0
  fi

  notify "Launching Deez Project Manager…" 95
  if [ -d "$APP" ]; then
    log "open app: $APP"
    open "$APP"
  elif [ -x "$BIN" ]; then
    log "start binary: $BIN"
    "$BIN" >/dev/null 2>&1 &
  else
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

  if [ -d "$APP" ]; then
    log "launch assumed ok via open (pgrep timeout)"
    return 0
  fi

  log "launch verification failed"
  return 1
}

log "launcher start: rebuild=$REBUILD"
notify "Preparing launch…" 5

update_repo
install_npm_dependencies
notify "Checking release build…" 30

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
# #region agent log
python3 - "$APP" "$BIN" "$APP_EXISTS" "$SOURCE_NEWER" "$ROOT" "$REBUILD" <<'PY' 2>/dev/null || true
import json, os, sys, time
app, bin_path, app_exists, source_newer, root, rebuild = sys.argv[1:7]
payload = {
    "sessionId": "581201",
    "runId": "pre-fix",
    "hypothesisId": "H3",
    "location": "launch-release.sh:post-update",
    "message": "release state",
    "data": {
        "appExists": int(app_exists),
        "sourceIsNewer": int(source_newer),
        "rebuildFlag": int(rebuild),
        "appDirExists": os.path.isdir(app),
        "binExists": os.path.isfile(bin_path),
        "root": root,
    },
    "timestamp": int(time.time() * 1000),
}
for log_path in (
    "/Users/epic/Desktop/Projects/Bot Projects/Cursor/Deez-Project-Manager/.cursor/debug-581201.log",
    os.path.join(root, ".cursor", "debug-581201.log"),
):
    try:
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload) + "\n")
    except OSError:
        pass
PY
# #endregion

if [ "$APP_EXISTS" -eq 1 ] && [ "$REBUILD" -eq 0 ] && [ "$SOURCE_NEWER" -eq 0 ]; then
  if start_release; then
    exit 0
  fi
  exit 1
fi

pids="$(release_pids)"
if [ -n "$pids" ]; then
  notify "Stopping running app before rebuild…" 35
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
  notify "Release app missing — building…" 35
elif [ "$REBUILD" -eq 1 ]; then
  notify "Refresh requested — rebuilding…" 35
else
  notify "Source updated — rebuilding…" 35
  log "source newer; rebuild-first path"
fi

if ! build_release; then
  if [ -d "$APP" ] || [ -x "$BIN" ]; then
    notify "Rebuild failed — launching existing app…" 90
    log "rebuild failed; fallback launch"
    start_release || true
    exit 1
  fi
  log "no release app available"
  exit 1
fi

if start_release; then
  exit 0
fi
exit 1