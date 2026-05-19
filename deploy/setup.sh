#!/usr/bin/env bash
# One-time production setup on the server (run from repo root as aiadmin or with sudo where noted).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Backend: install & build"
cd backend
npm ci
npm run build
mkdir -p logs
cd ..

echo "==> Frontend: install & build"
cd frontend
npm ci
npm run build
cd ..

echo "==> PM2: start API on port 8001"
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Nginx: enable site (requires sudo)"
if command -v nginx >/dev/null 2>&1; then
  sudo cp deploy/nginx/autoreco.indiraivf.in.conf /etc/nginx/sites-available/
  sudo ln -sf /etc/nginx/sites-available/autoreco.indiraivf.in.conf /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl reload nginx
  echo "Nginx reloaded."
else
  echo "nginx not found — copy deploy/nginx/autoreco.indiraivf.in.conf manually."
fi

echo "Done. API: http://127.0.0.1:8001/api  |  Site: https://autoreco.indiraivf.in"
