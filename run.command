#!/bin/bash
cd "$(dirname "$0")"
ROOT="$(pwd)"

# Prefer ~/.local/bin (Hermes Node) over Homebrew — see scripts/launch-release.sh.
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ "${1:-}" = "--shortcut" ]; then
  DEST="$HOME/Desktop/Deez Project Manager.command"
  ln -sf "$ROOT/run.command" "$DEST"
  chmod +x "$ROOT/run.command" "$DEST" 2>/dev/null || chmod +x "$ROOT/run.command"
  echo "Desktop shortcut created:"
  echo "  $DEST"
  echo "Target:"
  echo "  $ROOT/run.command"
  echo
  bash "$ROOT/scripts/install-dock-launcher.sh"
  status=$?
  if [ "$status" -eq 0 ]; then
    open -R "$HOME/Applications/Deez Project Manager.app" 2>/dev/null || true
  fi
  echo
  read -r
  exit "$status"
fi

bash "$ROOT/scripts/launch-with-ui.sh" "$@"
exit $?
