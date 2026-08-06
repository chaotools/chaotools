#!/bin/bash
# Deploy Tools to Cloudflare Pages

set -e

echo "🚀 Deploying Chaotools Tools to Cloudflare Pages..."

cd "$(dirname "$0")/.."

# Wrangler deploy
wrangler pages deploy tools/ --project-name=chaotools-tools

echo "✅ Deployment complete!"
