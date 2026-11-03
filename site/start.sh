#!/usr/bin/env bash
# Runs the manager site in the foreground on port 4400 (PORT overrides), in development mode, so
# a change in this checkout is live as soon as it's saved: Vite serves app/ from source with HMR,
# and the server restarts itself when server/, server.ts or app/shared change (npm run dev).
# The artifact isn't built here: `npm run build` makes dist-artifact/artifact.html to publish.
set -euo pipefail
cd "$(dirname "$0")"

# GH_TOKEN for read-only GitHub calls; the box's own token is not the site's to hold.
eval "$(discobox-access env)"
unset DISCOBOX_TOKEN

if [ ! -d node_modules/remix ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi

exec npm run --silent dev
