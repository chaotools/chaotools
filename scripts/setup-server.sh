#!/bin/bash
# Setup production server

set -e

echo "🔧 Setting up Chaotools production server..."

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2
npm install -g pm2

# Create app directory
sudo mkdir -p /var/www/chaotools
sudo chown $USER:$USER /var/www/chaotools

# Clone repo
cd /var/www/chaotools
git clone https://github.com/YOUR_USERNAME/chaotools.git .

# Install dependencies
pnpm install --frozen-lockfile

# Build
pnpm build

# Setup PM2
pm2 start dist/index.js --name gateway
pm2 save
pm2 startup

echo "✅ Server setup complete!"
