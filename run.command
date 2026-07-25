#!/bin/bash
cd "$(dirname "$0")"
ROOT="$(pwd)"

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

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

bash "$ROOT/scripts/launch-with-ui.sh" "$@"
exit $?
