#!/usr/bin/env bash
# Serve the mesh PWA on the LAN so iPhone / Android can join.
# Usage: ./scripts/serve-mesh.sh   (builds if dist/ missing)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-5187}"
if [[ ! -d dist ]]; then
  npm run build
fi
echo "Mesh PWA → http://0.0.0.0:${PORT}  (open this host’s LAN IP from phones)"
npx --yes serve -s dist -l "tcp://0.0.0.0:${PORT}"
