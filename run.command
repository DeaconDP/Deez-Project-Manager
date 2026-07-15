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

if [ ! -d node_modules ]; then
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
