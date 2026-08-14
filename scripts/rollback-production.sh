#!/usr/bin/env bash
set -euo pipefail

: "${SERVER_HOST:?SERVER_HOST is required}"
: "${SERVER_USER:?SERVER_USER is required}"
: "${VERSION:?VERSION is required}"

ssh "${SERVER_USER}@${SERVER_HOST}" "
  set -euo pipefail
  test -d '/var/www/releases/${VERSION}'
  ln -sfn '/var/www/releases/${VERSION}' /var/www/current
  sudo systemctl restart chaotools-gateway.service
  curl -fsS http://127.0.0.1:3001/health >/dev/null
"

echo "Rolled back to ${VERSION}."
