#!/bin/bash
cd "$(dirname "$0")"
ROOT="$(pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

if [ "${1:-}" = "--shortcut" ]; then
  DEST="$HOME/Desktop/Deez Project Manager.command"
  ln -sf "$ROOT/run.command" "$DEST"
  chmod +x "$ROOT/run.command" "$DEST" 2>/dev/null || chmod +x "$ROOT/run.command"
  echo "Desktop shortcut created:"
  echo "  $DEST"
  echo "Target:"
  echo "  $ROOT/run.command"
  echo
  read -r
  exit 0
fi

bash "$ROOT/scripts/launch-release.sh" "$@"
status=$?
if [ $status -ne 0 ]; then
  echo
  echo "Deez Project Manager failed to launch."
  read -r
  exit $status
fi
exit 0
