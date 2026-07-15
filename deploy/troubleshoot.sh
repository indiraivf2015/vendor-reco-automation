#!/usr/bin/env bash
# Run on the server to diagnose autoreco.indiraivf.in 500 errors.
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/home/aiadmin/vendor-master/vendor-reco-automation}"
DIST="$ROOT/frontend/dist"
NGINX_SITE="/etc/nginx/sites-enabled/autoreco.indiraivf.in.conf"

echo "=== 1. Frontend build (index.html must exist) ==="
if [[ -f "$DIST/index.html" ]]; then
  echo "OK: $DIST/index.html exists"
  ls -la "$DIST/index.html"
else
  echo "FAIL: $DIST/index.html missing"
  echo "Fix: cd $ROOT/frontend && npm ci && npm run build"
fi

echo ""
echo "=== 2. Nginx root in active config ==="
if [[ -f "$NGINX_SITE" ]]; then
  grep -E '^\s*root\s' "$NGINX_SITE" || true
else
  echo "WARN: $NGINX_SITE not found — check sites-available"
fi

echo ""
echo "=== 3. Permissions (www-data must traverse home + read dist) ==="
namei -l "$DIST/index.html" 2>/dev/null || ls -la "$ROOT" "$ROOT/frontend" "$DIST" 2>/dev/null || true
echo "If /home/aiadmin is drwx------, run: chmod 755 /home/aiadmin"
echo "Then: chmod -R 755 $DIST"

echo ""
echo "=== 4. Nginx config test ==="
sudo nginx -t 2>&1 || true

echo ""
echo "=== 5. Recent nginx errors ==="
sudo tail -30 /var/log/nginx/error.log 2>/dev/null || true

echo ""
echo "=== 6. Backend (PM2) on port 8001 ==="
pm2 list 2>/dev/null | grep -E 'vendor-reco|8001' || pm2 list 2>/dev/null || true
curl -s -o /dev/null -w "GET /api/docs → HTTP %{http_code}\n" http://127.0.0.1:8001/api/docs || echo "curl failed — is vendor-reco-backend running?"

echo ""
echo "=== 7. Local curl (from server) ==="
curl -s -o /dev/null -w "HTTPS / → HTTP %{http_code}\n" -k https://127.0.0.1/ -H 'Host: autoreco.indiraivf.in' 2>/dev/null || true
