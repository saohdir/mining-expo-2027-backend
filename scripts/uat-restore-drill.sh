#!/usr/bin/env bash
# IMDX 2027 — restore drill (NFR-29). Restores the newest (or given) dump into a TEMPORARY database inside the postgres
# container, compares row counts with the live database, then drops the temporary database. The live database is only read.
#   bash scripts/uat-restore-drill.sh [/root/imdx-backups/db-XXXX.dump]
# Suggested weekly cron: 40 3 * * 0 /bin/bash /opt/imdx/mining-expo-2027-backend/scripts/uat-restore-drill.sh >> /var/log/imdx-restore-drill.log 2>&1
set -euo pipefail
BASE="${IMDX_BASE_DIR:-/opt/imdx}"; BACK="$BASE/mining-expo-2027-backend"; DIR="${BACKUP_DIR:-/root/imdx-backups}"
DBU="${IMDX_DB_USER:-imdx}" DBN="${IMDX_DB_NAME:-imdx_uat}" DRILL="imdx_restore_drill"
DC=(docker compose --env-file "$BACK/.env.uat" -f "$BACK/deploy/compose.uat.yml")
DUMP="${1:-$(ls -t "$DIR"/db-*.dump 2>/dev/null | head -1)}"
[[ -s "$DUMP" ]] || { echo "No dump found (run scripts/uat-backup.sh first)"; exit 1; }
psql_(){ "${DC[@]}" exec -T postgres psql -U "$DBU" -d "$1" -v ON_ERROR_STOP=1 -tAq -c "$2"; }
trap 'psql_ postgres "DROP DATABASE IF EXISTS $DRILL" >/dev/null 2>&1 || true' EXIT
psql_ postgres "DROP DATABASE IF EXISTS $DRILL"; psql_ postgres "CREATE DATABASE $DRILL"
"${DC[@]}" exec -T postgres pg_restore -U "$DBU" -d "$DRILL" --no-owner --exit-on-error < "$DUMP"
Q="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (SELECT 'Event' t, count(*) n FROM \"Event\" UNION ALL SELECT 'CustomerAccount', count(*) FROM \"CustomerAccount\" UNION ALL SELECT 'Enrollment', count(*) FROM \"Enrollment\" UNION ALL SELECT 'Invoice', count(*) FROM \"Invoice\" UNION ALL SELECT 'ManualTransfer', count(*) FROM \"ManualTransfer\" UNION ALL SELECT 'EventPass', count(*) FROM \"EventPass\" UNION ALL SELECT 'AuditLog', count(*) FROM \"AuditLog\") x"
restored="$(psql_ "$DRILL" "$Q")"; live="$(psql_ "$DBN" "$Q")"
echo "dump:     $DUMP ($(stat -c %y "$DUMP" | cut -d. -f1))"
echo "restored: $restored"
echo "live now: $live"
echo "Restore drill OK (counts may legitimately be higher live if data was added after the dump)."
