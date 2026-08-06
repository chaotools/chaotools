#!/bin/bash
# Deploy Hub to Vercel

set -e

echo "🚀 Deploying Chaotools Hub to Vercel..."

cd "$(dirname "$0")/.."

# Build
echo "📦 Building hub..."
pnpm -r --filter @chaotools/hub build

# Deploy
echo "🚀 Deploying to Vercel..."
vercel --prod --token=$VERCEL_TOKEN --project=$VERCEL_HUB_PROJECT_ID

echo "✅ Deployment complete!"
