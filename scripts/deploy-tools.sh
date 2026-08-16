#!/usr/bin/env bash
set -euo pipefail

node scripts/validate-manifest.mjs
echo "Tool manifest validated. Use scripts/deploy-gateway.sh for the atomic production release."
