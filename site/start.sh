#!/usr/bin/env bash
# Runs the manager site in the foreground on port 4400 (PORT overrides).
# The browser app is built with Vite first (dist/ for this site, dist-artifact/artifact.html for
# the claude.ai artifact); the server runs its TypeScript directly through remix/node-tsx.
set -euo pipefail
cd "$(dirname "$0")"

# GH_TOKEN for read-only GitHub calls; the box's own token is not the site's to hold.
eval "$(discobox-access env)"
unset DISCOBOX_TOKEN

if [ ! -d node_modules/remix ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi

npm run build --silent

export NODE_ENV=production
exec node --import remix/node-tsx server.ts
