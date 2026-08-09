#!/usr/bin/env bash
# Deploy cepat di VPS: pull + install + restart PM2
# Usage: bash scripts/deploy-vps.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Git pull"
git pull --ff-only

echo "==> Install dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Restart PM2"
if command -v pm2 >/dev/null 2>&1; then
  if [[ -f ecosystem.config.cjs ]]; then
    pm2 startOrReload ecosystem.config.cjs --env production
  else
    pm2 restart arthurg-website || pm2 restart all
  fi
  pm2 save || true
else
  echo "PM2 tidak ditemukan. Jalankan manual: node api/index.js"
fi

echo "==> Verifikasi lokal"
sleep 1
curl -fsS "http://127.0.0.1:3000/api/version" || true
echo
curl -fsS -o /dev/null -w "tiktok:%{http_code}\n" "http://127.0.0.1:3000/public/tiktok" || true
curl -fsS "http://127.0.0.1:3000/api/public/trends?country=indonesia" | head -c 180 || true
echo
echo "==> Selesai. Cek https://arthurg.my.id/api/version (harus build 2026-08-09-emergency-fix)"
