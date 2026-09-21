#!/usr/bin/env bash
#
# Redeploy after a code change: pull, install, migrate, build, restart.
# Run as root on the server, after deploy/setup.sh has already run once.
#
#   BRANCH=main bash deploy/deploy.sh
set -euo pipefail

BRANCH="${BRANCH:-main}"
APP_DIR=/opt/irice/app
ENV_FILE=/etc/irice/irice.env

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root." >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE not found — run deploy/setup.sh first." >&2
  exit 1
fi

cd "$APP_DIR"
sudo -u irice git fetch origin "$BRANCH"
sudo -u irice git reset --hard "origin/$BRANCH"
sudo -u irice pnpm install --frozen-lockfile
sudo -u irice env $(grep -v '^#' "$ENV_FILE" | xargs) pnpm db:migrate
sudo -u irice env $(grep -v '^#' "$ENV_FILE" | xargs) pnpm build
systemctl restart irice
systemctl status irice --no-pager -l | head -10
