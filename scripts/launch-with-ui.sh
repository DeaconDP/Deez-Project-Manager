#!/usr/bin/env bash
# Hide Terminal and show a dark loading screen while launch-release.sh runs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

STATUS_FILE="${TMPDIR:-/tmp}/deez-project-manager-launch-status.json"
LOG="${TMPDIR:-/tmp}/deez-project-manager-launch.log"
UI_PORT="${LAUNCH_UI_PORT:-5188}"
UI_URL="http://127.0.0.1:${UI_PORT}/"
SERVER_PID=""
BROWSER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$BROWSER_PID" ] && kill "$BROWSER_PID" 2>/dev/null || true
  rm -rf "${TMPDIR:-/tmp}/deez-pm-loading-profile" 2>/dev/null || true
  rm -f "$STATUS_FILE" "${STATUS_FILE}.building" 2>/dev/null || true
}

write_status() {
  local message="$1"
  local progress="${2:-null}"
  local done="${3:-false}"
  local error="${4:-false}"
  python3 - "$message" "$progress" "$done" "$error" "$STATUS_FILE" <<'PY'
import json, sys
message, progress, done, error, path = sys.argv[1:6]
payload = {
    "message": message,
    "progress": None if progress == "null" else float(progress),
    "done": done == "true",
    "error": error == "true",
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle)
PY
}

show_error_dialog() {
  local text="$1"
  osascript - "$text" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  set msg to item 1 of argv
  display dialog msg buttons {"Close"} default button "Close" with icon stop with title "Deez Project Manager"
end run
APPLESCRIPT
}

hide_terminal() {
  osascript -e 'tell application "Terminal" to set visible of front window to false' >/dev/null 2>&1 || true
}

close_terminal() {
  osascript -e 'tell application "Terminal" to close front window' >/dev/null 2>&1 || true
}

show_terminal() {
  osascript -e 'tell application "Terminal" to activate' >/dev/null 2>&1 || true
  osascript -e 'tell application "Terminal" to set visible of front window to true' >/dev/null 2>&1 || true
}

open_loading_window() {
  local url="$1"
  local profile="${TMPDIR:-/tmp}/deez-pm-loading-profile"
  mkdir -p "$profile"
  if [ -x "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" ]; then
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
      --user-data-dir="$profile" --app="$url" --window-size=480,280 --window-position=200,200 &
    BROWSER_PID=$!
    return 0
  fi
  if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --user-data-dir="$profile" --app="$url" --window-size=480,280 --window-position=200,200 &
    BROWSER_PID=$!
    return 0
  fi
  if [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
      --user-data-dir="$profile" --app="$url" --window-size=480,280 --window-position=200,200 &
    BROWSER_PID=$!
    return 0
  fi
  open "$url"
}

start_loading_server() {
  export LAUNCH_STATUS_FILE="$STATUS_FILE"
  export LAUNCH_UI_PORT="$UI_PORT"
  python3 "$ROOT/scripts/loading-server.py" &
  SERVER_PID=$!
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    if curl -fsS "$UI_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  echo "Loading screen server did not start on port ${UI_PORT}." >&2
  return 1
}

trap 'cleanup' EXIT

hide_terminal
write_status "Starting…" 0 false false

if ! start_loading_server; then
  show_error_dialog "Could not open the loading screen. Check ${LOG} for details."
  show_terminal
  exit 1
fi

open_loading_window "$UI_URL"

export LAUNCH_STATUS_FILE="$STATUS_FILE"
set +e
bash "$ROOT/scripts/launch-release.sh" "$@" >>"$LOG" 2>&1
status=$?
set -e

if [ "$status" -eq 0 ]; then
  write_status "Launching Deez Project Manager…" 100 true false
  sleep 0.45
  cleanup
  close_terminal
  exit 0
fi

write_status "Launch failed." 100 true true
sleep 0.35
cleanup

error_text="Deez Project Manager failed to launch."
if [ -f "$LOG" ]; then
  tail_lines="$(tail -n 8 "$LOG" | sed 's/"/\\"/g')"
  if [ -n "$tail_lines" ]; then
    error_text="${error_text}

${tail_lines}"
  fi
fi
show_error_dialog "$error_text"
show_terminal
echo
echo "Deez Project Manager failed to launch."
echo "Details: $LOG"
read -r
exit "$status"
