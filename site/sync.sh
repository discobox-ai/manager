#!/usr/bin/env bash
# Runs the artifact sync (sync.ts) in the foreground, restarting it when sync.ts, server/ or
# app/shared change, like the site's dev mode. Extra arguments pass through (--once, --dry-run:
# a single run, so no watching). SITE_STATE_DIR / SITE_TABLE / SYNC_DIR point it at test copies.
set -euo pipefail
cd "$(dirname "$0")"

# GH_TOKEN for read-only GitHub calls; the box's own token is not the sync's to hold.
eval "$(discobox-access env)"
unset DISCOBOX_TOKEN

if [ ! -d node_modules/remix ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi

if [ "$#" -gt 0 ]; then
  exec node --import remix/node-tsx sync.ts "$@"
fi
exec node --watch-path=sync.ts --watch-path=server --watch-path=app/shared --import remix/node-tsx sync.ts
