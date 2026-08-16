#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @chaotools/hub build
echo "Hub built. Use scripts/deploy-gateway.sh for the atomic production release."
