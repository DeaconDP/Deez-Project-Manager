#!/usr/bin/env bash
# dale-auto-rebuild — shared Dock / run.command helper (fleet local path).
#
# Rules (same as Deez-PM Update Local):
#   1. git fetch — if behind upstream → git pull --ff-only
#   2. Missing binary / no .last-build → rebuild
#   3. Source newer than .last-build → rebuild
#   4. --rebuild forces
#
# Project-specific rebuild: set DALE_REBUILD_CMD, or provide rebuild.sh, else
# fall through to npm run build when package.json exists.
#
# Usage (from project root or via Update Local):
#   ./scripts/dale-auto-rebuild.sh [--rebuild] [--no-pull] [--stamp-only]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE=0
DO_PULL=1
STAMP_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --rebuild|-Rebuild) FORCE=1 ;;
    --no-pull) DO_PULL=0 ;;
    --stamp-only) STAMP_ONLY=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: dale-auto-rebuild.sh [--rebuild] [--no-pull] [--stamp-only]
  --rebuild     Force rebuild even if .last-build is fresh
  --no-pull     Skip git fetch/pull
  --stamp-only  Write .last-build and exit (no rebuild)
EOF
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

STAMP="$ROOT/.last-build"
LOG="${TMPDIR:-/tmp}/dale-auto-rebuild.log"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"
}

die() {
  echo "$*" >&2
  log "fatal: $*"
  exit 1
}

notify() {
  echo "$*"
  log "$*"
}

git_behind_count() {
  git rev-list --left-right --count 'HEAD...@{upstream}' 2>/dev/null | awk '{print $2+0}'
}

maybe_pull() {
  [ "$DO_PULL" -eq 1 ] || return 0
  [ -d "$ROOT/.git" ] || return 0
  command -v git >/dev/null || return 0
  notify "git fetch…"
  git fetch --quiet || die "git fetch failed"
  local behind
  behind="$(git_behind_count || echo 0)"
  if [ "${behind:-0}" -gt 0 ]; then
    notify "behind $behind — git pull --ff-only…"
    git pull --ff-only || die "git pull --ff-only failed"
  else
    notify "git up to date"
  fi
}

source_newer_than_stamp() {
  [ -f "$STAMP" ] || return 0
  local paths=()
  local p
  for p in src package.json package-lock.json index.html vite.config.ts \
    vite.config.js next.config.js next.config.mjs tsconfig.json \
    Cargo.toml src-tauri; do
    [ -e "$ROOT/$p" ] && paths+=("$ROOT/$p")
  done
  [ "${#paths[@]}" -gt 0 ] || return 1
  find "${paths[@]}" -type f -newer "$STAMP" 2>/dev/null | head -n 1 | grep -q .
}

needs_rebuild() {
  [ "$FORCE" -eq 1 ] && return 0
  [ -f "$STAMP" ] || return 0
  source_newer_than_stamp
}

write_stamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ >"$STAMP"
  notify "wrote $STAMP"
}

run_rebuild() {
  if [ -n "${DALE_REBUILD_CMD:-}" ]; then
    notify "rebuild: $DALE_REBUILD_CMD"
    # shellcheck disable=SC2086
    eval $DALE_REBUILD_CMD || die "DALE_REBUILD_CMD failed"
    return 0
  fi
  if [ -x "$ROOT/rebuild.sh" ]; then
    notify "rebuild: ./rebuild.sh"
    "$ROOT/rebuild.sh" || die "rebuild.sh failed"
    return 0
  fi
  if [ -f "$ROOT/package.json" ] && command -v npm >/dev/null; then
    if node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.build?0:1)" 2>/dev/null; then
      notify "rebuild: npm run build"
      npm run build || die "npm run build failed"
      return 0
    fi
  fi
  die "No rebuild command. Set DALE_REBUILD_CMD, add rebuild.sh, or package.json scripts.build"
}

log "start force=$FORCE pull=$DO_PULL stamp_only=$STAMP_ONLY root=$ROOT"
maybe_pull

if [ "$STAMP_ONLY" -eq 1 ]; then
  write_stamp
  exit 0
fi

if needs_rebuild; then
  run_rebuild
  write_stamp
else
  notify "skip rebuild (stamp fresh)"
fi
