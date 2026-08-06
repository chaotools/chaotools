#!/bin/bash
# Deploy All Services

set -e

echo "🚀 Deploying Chaotools..."

# Deploy in parallel where possible
./scripts/deploy-hub.sh &
HUB_PID=$!

./scripts/deploy-tools.sh &
TOOLS_PID=$!

# Wait for all
wait $HUB_PID
wait $TOOLS_PID

# Deploy gateway (usually needs more care)
./scripts/deploy-gateway.sh

echo "✅ All deployments complete!"
