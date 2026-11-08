#!/usr/bin/env bash
# IMDX 2027 — S0 READ-ONLY UAT preflight. Run on the Hostinger VPS host shell.
# It changes nothing: no pull, no build, no restart, no migration, no writes to
# PostgreSQL. Secret values are NEVER printed: only SET/EMPTY for secrets and
# true/false for non-secret feature flags.
#
#   bash scripts/uat-preflight-readonly.sh 2>&1 | tee /root/imdx-preflight-$(date -u +%Y%m%dT%H%M%SZ).txt
#
# Review the output for personal data before sharing it.
set -uo pipefail
BASE="${IMDX_BASE_DIR:-/opt/imdx}"
FRONT="$BASE/mining-expo-2027-demo"
BACK="$BASE/mining-expo-2027-backend"
ENV_FILE="$BACK/.env.uat"
DC=(docker compose --env-file "$ENV_FILE" -f "$BACK/deploy/compose.uat.yml")
section(){ printf '\n===== %s =====\n' "$1"; }
cd "$BACK" || { echo "Missing $BACK"; exit 1; }

section "1. Git: local HEAD vs GitHub main (read-only, uses ls-remote)"
for dir in "$BACK" "$FRONT"; do
  echo "-- $dir"
  git -C "$dir" status -sb | head -5
  echo "local HEAD : $(git -C "$dir" rev-parse HEAD)"
  echo "github main: $(git -C "$dir" ls-remote origin refs/heads/main | cut -f1)"
  git -C "$dir" log -1 --format='last commit: %h %ci %s'
done

section "2. Feature flags (non-secret values) and secret presence (values hidden)"
if [[ -f "$ENV_FILE" ]]; then
  echo "env file mode: $(stat -c '%a %U' "$ENV_FILE")"
  for k in ENABLE_REGISTRATION ENABLE_INVOICES ENABLE_QR_ADMISSION ALLOW_BOOTH_ALLOCATION_ON_DP SMS_PROVIDER EMAIL_PROVIDER APP_STAGE; do
    v="$(grep -E "^$k=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ')"
    echo "$k=${v:-<unset>}"
  done
  for k in IMDX_DB_PASSWORD OTP_HASH_SECRET QR_ENCRYPTION_KEY SESSION_KEY PUBLIC_BASE_URL SMTP_PASS TWILIO_AUTH_TOKEN APPROVED_BANK_ACCOUNT_NUMBER ADMIN_SEED_EMAIL ADMIN_SEED_PASSWORD; do
    if grep -qE "^$k=.+" "$ENV_FILE"; then echo "$k: SET"; else echo "$k: EMPTY/UNSET"; fi
  done
  echo "(ADMIN_SEED_* should be EMPTY/UNSET after bootstrap)"
else
  echo "Missing $ENV_FILE"
fi

section "3. Containers, images and host resources"
"${DC[@]}" ps
for s in app worker web postgres; do
  cid="$("${DC[@]}" ps -q "$s" 2>/dev/null)"
  [[ -n "$cid" ]] && docker inspect -f "$s: status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} restarts={{.RestartCount}} started={{.State.StartedAt}} image={{.Image}}" "$cid"
done
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedAt}}' | grep -i imdx
free -h; df -h / /var/lib/docker 2>/dev/null
docker volume ls | grep -i imdx

section "4. HTTP checks (local reverse proxy and public HTTPS)"
for r in / /api/health /account /admin /admin/floorplans /admin/booths /admin/payments /api/public/floorplan; do
  printf '%-22s local=%s  https=%s\n' "$r" \
    "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "http://127.0.0.1:8080$r")" \
    "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://uat.imdx.tech$r")"
done
curl -s -m 15 http://127.0.0.1:8080/api/health; echo
echo "-- app health from inside web container (Nginx upstream resolution):"
"${DC[@]}" exec -T web wget -q -O - http://app:3000/api/health 2>&1 | head -c 300; echo
echo "-- deployed nginx.conf equals repo version?"
"${DC[@]}" exec -T web cat /etc/nginx/conf.d/default.conf | diff -q - deploy/nginx.conf && echo "nginx.conf: identical"

section "5. PostgreSQL schema, migrations and constraints (SELECT only)"
"${DC[@]}" exec -T postgres psql -U imdx -d imdx_uat -v ON_ERROR_STOP=0 -P pager=off <<'SQL'
SELECT current_database(), version();
SELECT to_regclass('public."BoothOffer"') AS booth_offer, to_regclass('public."BoothHold"') AS booth_hold, to_regclass('public."_prisma_migrations"') AS prisma_migrations_table;
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN
 ('BoothAssignment_one_active_per_unit','BoothHold_one_active_per_unit','Floorplan_one_published_per_event','BoothOffer_boothRequestId_revision_key');
SELECT conname, conrelid::regclass FROM pg_constraint WHERE conname IN ('BoothOffer_quotedPriceMinor_check','BoothOffer_revision_check','BoothHold_status_check','BoothHold_expiry_check');
-- Duplicate checks: each must return ZERO rows before applying migrations.
SELECT 'dup_active_assignment' AS check, "boothUnitId", COUNT(*) FROM "BoothAssignment" WHERE "active" = TRUE GROUP BY "boothUnitId" HAVING COUNT(*) > 1;
SELECT 'dup_published_floorplan' AS check, "eventId", COUNT(*) FROM "Floorplan" WHERE "status" = 'PUBLISHED' GROUP BY "eventId" HAVING COUNT(*) > 1;
-- Row counts only (no personal data).
SELECT 'Event' t, COUNT(*) FROM "Event" UNION ALL SELECT 'CustomerAccount', COUNT(*) FROM "CustomerAccount"
 UNION ALL SELECT 'AdminUser', COUNT(*) FROM "AdminUser" UNION ALL SELECT 'Enrollment', COUNT(*) FROM "Enrollment"
 UNION ALL SELECT 'Floorplan', COUNT(*) FROM "Floorplan" UNION ALL SELECT 'BoothUnit', COUNT(*) FROM "BoothUnit"
 UNION ALL SELECT 'BoothRequest', COUNT(*) FROM "BoothRequest" UNION ALL SELECT 'BoothAssignment', COUNT(*) FROM "BoothAssignment"
 UNION ALL SELECT 'Invoice', COUNT(*) FROM "Invoice" UNION ALL SELECT 'ManualTransfer', COUNT(*) FROM "ManualTransfer"
 UNION ALL SELECT 'AuditLog', COUNT(*) FROM "AuditLog";
SELECT role, COUNT(*) FROM "AdminUser" GROUP BY role ORDER BY role;
SELECT state, COUNT(*) FROM "NotificationOutbox" GROUP BY state ORDER BY state;
SELECT status, COUNT(*) FROM "Floorplan" GROUP BY status;
SQL

section "6. Backups and persistent data"
ls -la /root/imdx-backups 2>/dev/null | tail -10 || echo "No /root/imdx-backups directory"
crontab -l 2>/dev/null | grep -i -E 'pg_dump|imdx' || echo "No scheduled backup found in root crontab"
"${DC[@]}" exec -T app sh -c 'ls /var/lib/imdx/floorplans 2>/dev/null | wc -l' | sed 's/^/floorplan upload files: /'

section "7. Recent logs (tail; check for errors — review for PII before sharing)"
for s in app worker web; do
  echo "-- $s (errors/warnings in last 300 lines)"
  "${DC[@]}" logs --tail=300 "$s" 2>&1 | grep -iE 'error|fail|warn|502|does not exist|ECONN|killed|OOM' | tail -15
done

section "8. Host reverse proxy (Caddy) target"
(grep -n -A4 'uat.imdx.tech' /etc/caddy/Caddyfile 2>/dev/null || echo "No /etc/caddy/Caddyfile (check other proxy)")
systemctl is-active caddy 2>/dev/null
echo; echo "Preflight finished. Nothing was changed."
