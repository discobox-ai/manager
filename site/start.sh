#!/usr/bin/env bash
# Runs the manager site in the foreground on port 4400 (PORT overrides).
# Remix 3 compiles TypeScript/JSX at runtime (remix/node-tsx and its asset server), so there is
# no build step: installing dependencies is all the setup there is.
set -euo pipefail
cd "$(dirname "$0")"

# GH_TOKEN for read-only GitHub calls; the box's own token is not the site's to hold.
eval "$(discobox-access env)"
unset DISCOBOX_TOKEN

if [ ! -d node_modules/remix ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund
fi

export NODE_ENV=production
exec node --import remix/node-tsx server.ts
