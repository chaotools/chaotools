#!/usr/bin/env bash
set -euo pipefail

# Deploy the complete production worktree to the systemd-backed server.
# Run from a checked-out commit in CI or from a developer worktree.

: "${SERVER_HOST:?SERVER_HOST is required}"
: "${SERVER_USER:?SERVER_USER is required}"

VERSION="${VERSION:-$(date -u +%Y%m%d-%H%M%S)}"
RELEASE="/var/www/releases/${VERSION}"
CURRENT="/var/www/current"
GIT_REF="${GIT_REF:-HEAD}"

echo "Deploying ${GIT_REF} as ${VERSION}"

git archive --format=tar "${GIT_REF}" | gzip -1 | \
  ssh "${SERVER_USER}@${SERVER_HOST}" \
    "mkdir -p '${RELEASE}' && tar -xzf - -C '${RELEASE}'"

ssh "${SERVER_USER}@${SERVER_HOST}" "
  set -euo pipefail
  cd '${RELEASE}'
  pnpm install --frozen-lockfile
  pnpm --filter @chaotools/types build
  pnpm --filter @chaotools/sdk build
  pnpm --filter @chaotools/gateway build
  pnpm --filter @chaotools/hub build
  cp -a hub/dist/. '${RELEASE}/'
  test -f '${RELEASE}/index.html'
  test -f '${RELEASE}/manifest.json'
  ln -sfn '${RELEASE}' '${CURRENT}'
  sudo systemctl restart chaotools-gateway.service
  curl -fsS http://127.0.0.1:3001/health >/dev/null
  curl -fsS http://127.0.0.1:3001/ready >/dev/null
"

echo "Deployment ${VERSION} is active."
