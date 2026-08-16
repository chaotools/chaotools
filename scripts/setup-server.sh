#!/usr/bin/env bash
set -euo pipefail

# One-time setup for the current Ubuntu + Nginx + systemd layout.
sudo mkdir -p /var/www/releases /var/www/current /etc/chaotools
sudo chown -R "${USER}:${USER}" /var/www/releases
sudo install -d -o "${USER}" -g "${USER}" /home/ubuntu/chaotools-data
echo "Install Node.js and pnpm using the host's package policy, then copy the"
echo "ops/systemd/chaotools-gateway.service unit and set /etc/chaotools/gateway.env (0600)."
echo "No PM2 process or /var/www/chaotools checkout is created by this script."
