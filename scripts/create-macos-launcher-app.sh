#!/usr/bin/env bash
# Compat wrapper — prefer install-dock-launcher.sh (~/Applications).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/install-dock-launcher.sh" "$@"
