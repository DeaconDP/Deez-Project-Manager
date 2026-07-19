#!/bin/bash
cd "$(dirname "$0")"

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

echo "Starting Deez Project Manager desktop app..."
echo "Vite (internal): http://127.0.0.1:5187"
echo "Do NOT open that URL in a browser — use the Deez Project Manager window that opens."

npm run tauri dev
status=$?
if [ $status -ne 0 ]; then
  echo
  echo "Deez Project Manager failed to start."
  read -r
  exit $status
fi
