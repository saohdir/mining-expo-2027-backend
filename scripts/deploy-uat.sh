#!/usr/bin/env bash
# Manual UAT deployment from the VPS host. Never run this on a workstation.
set -euo pipefail
BASE="${IMDX_BASE_DIR:-/opt/imdx}"
FRONT="$BASE/mining-expo-2027-demo"
BACK="$BASE/mining-expo-2027-backend"
COMPOSE="$BACK/deploy/compose.uat.yml"
ENV_FILE="$BACK/.env.uat"

echo "[1/7] Validating expected UAT deployment directories..."
for required in "$FRONT/.git" "$BACK/.git" "$COMPOSE" "$ENV_FILE"; do
  if [[ ! -e "$required" ]]; then echo "Missing required UAT resource: $required" >&2; exit 1; fi
done
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is required" >&2; exit 1; }

echo "[2/7] Check both repositories have no tracked local edits..."
for dir in "$FRONT" "$BACK"; do
  if ! git -C "$dir" diff --quiet || ! git -C "$dir" diff --cached --quiet; then
    echo "Tracked files were modified locally in $dir. Resolve manually before deployment." >&2
    exit 1
  fi
done

echo "[3/7] Fast-forwarding approved GitHub main branches..."
for dir in "$FRONT" "$BACK"; do
  branch="$(git -C "$dir" branch --show-current)"
  if [[ "$branch" != "main" ]]; then
    echo "Unexpected branch $branch in $dir. Deployment only supports main." >&2; exit 1
  fi
  git -C "$dir" pull --ff-only origin main
done

echo "[4/7] Verifying Compose syntax (secrets are not printed)..."
cd "$BACK"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" config --quiet

echo "[5/7] Building application images sequentially to reduce RAM pressure..."
COMPOSE_PARALLEL_LIMIT=1 docker compose --env-file "$ENV_FILE" -f "$COMPOSE" build app worker

echo "[6/7] Starting UAT containers without deleting PostgreSQL data..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d --no-build app worker web
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" ps

echo "[7/7] Checking local reverse proxy and secure API..."
for route in / /account /admin /admin/payments /admin/programmes /api/health; do
  code="$(curl --retry 4 --retry-delay 2 --retry-connrefused --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:8080$route")"
  if [[ "$code" != "200" ]]; then echo "UAT smoke check failed: $route returned $code" >&2; exit 1; fi
  echo "PASS $route (HTTP $code)"
done
echo "UAT code deployment completed. No database migration was applied."
echo "Confirm HTTPS from your browser. Keep registration/payment flags disabled until UAT policies are approved."
