#!/usr/bin/env bash
set -euo pipefail

# The production site is served from one atomic release tree. The gateway
# deploy script builds Hub and Gateway together, so there is no split Vercel /
# Cloudflare / PM2 deployment path to drift from the live server.
"$(dirname "$0")/deploy-gateway.sh"
