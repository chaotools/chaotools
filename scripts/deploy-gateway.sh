#!/bin/bash
# Deploy Gateway to Server

set -e

echo "🚀 Deploying Chaotools Gateway..."

cd "$(dirname "$0")/.."

# Build
echo "📦 Building gateway..."
pnpm -r --filter @chaotools/gateway build

# Deploy via SSH
echo "🚀 Deploying to server..."
ssh $SERVER_USER@$SERVER_HOST "
  cd /var/www/chaotools
  git pull
  pnpm install --frozen-lockfile
  pnpm -r --filter @chaotools/gateway build
  pm2 restart gateway || pm2 start dist/index.js --name gateway
"

echo "✅ Deployment complete!"
