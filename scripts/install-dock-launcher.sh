#!/usr/bin/env bash
# Install a Dock-friendly wrapper .app that runs launch-with-ui.sh (update → rebuild → open).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Deez Project Manager"
DEST="${1:-$HOME/Applications/${APP_NAME}.app}"
ICON_SRC="$ROOT/src-tauri/icons/icon.icns"
LAUNCH_UI="$ROOT/scripts/launch-with-ui.sh"

if [ ! -f "$LAUNCH_UI" ]; then
  echo "Missing launcher script: $LAUNCH_UI" >&2
  exit 1
fi

mkdir -p "$HOME/Applications"
rm -rf "$DEST"
mkdir -p "$DEST/Contents/MacOS" "$DEST/Contents/Resources"

cat >"$DEST/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>io.worldbuild.deez-project-manager.launcher</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

if [ -f "$ICON_SRC" ]; then
  cp "$ICON_SRC" "$DEST/Contents/Resources/AppIcon.icns"
fi

# Absolute repo path so the Dock pin survives moving only the .app
# (repo move requires re-running --shortcut).
printf '%s\n' "$ROOT" >"$DEST/Contents/Resources/repo.root"

cat >"$DEST/Contents/MacOS/launcher" <<'EOF'
#!/bin/bash
# Prefer ~/.local/bin (Hermes Node) over Homebrew — see launch-release.sh.
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(tr -d '\n' <"$HERE/../Resources/repo.root")"
if [ ! -d "$REPO" ] || [ ! -f "$REPO/scripts/launch-with-ui.sh" ]; then
  osascript -e 'display dialog "Deez Project Manager repo path is missing. Re-run ./run.command --shortcut from the project folder." buttons {"OK"} default button "OK" with icon stop with title "Deez Project Manager"' >/dev/null 2>&1 || true
  exit 1
fi
export DEEZ_PM_FROM_LAUNCHER=1
exec bash "$REPO/scripts/launch-with-ui.sh" "$@"
EOF
chmod +x "$DEST/Contents/MacOS/launcher"

# Remove stale Desktop wrapper if it was left from an older installer path
OLD_DESKTOP_APP="$HOME/Desktop/${APP_NAME}.app"
if [ -d "$OLD_DESKTOP_APP" ]; then
  rm -rf "$OLD_DESKTOP_APP"
fi

echo "Dock launcher app created:"
echo "  $DEST"
echo "Pin this to the Dock (not the release bundle under src-tauri/target)."
echo "Repo:"
echo "  $ROOT"
