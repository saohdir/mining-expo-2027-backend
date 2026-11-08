#!/usr/bin/env bash
# IMDX 2027 — nightly UAT backup (NFR-07/29). Run on the VPS host, e.g. from root's crontab:
#   15 2 * * * /bin/bash /opt/imdx/mining-expo-2027-backend/scripts/uat-backup.sh >> /var/log/imdx-backup.log 2>&1
# Writes a PostgreSQL custom-format dump plus an archive of the private-file and floorplan volumes, verifies the dump with
# pg_restore --list, keeps the newest $KEEP_DAYS days and exits non-zero on any failure (so cron mail/monitoring notices).
# Prints no secrets. Copy the backup directory off the VPS regularly (one copy on the same disk is not a backup).
set -euo pipefail
BASE="${IMDX_BASE_DIR:-/opt/imdx}"; BACK="$BASE/mining-expo-2027-backend"
DIR="${BACKUP_DIR:-/root/imdx-backups}"; KEEP_DAYS="${KEEP_DAYS:-14}"
DBU="${IMDX_DB_USER:-imdx}" DBN="${IMDX_DB_NAME:-imdx_uat}" PROJECT="${COMPOSE_PROJECT:-imdx-2027-uat}"
DC=(docker compose --env-file "$BACK/.env.uat" -f "$BACK/deploy/compose.uat.yml")
TS="$(date -u +%Y%m%dT%H%M%SZ)"; umask 077; mkdir -p "$DIR"
echo "[$TS] backup start"
"${DC[@]}" exec -T postgres pg_dump -U "$DBU" -d "$DBN" -Fc > "$DIR/db-$TS.dump"
[[ -s "$DIR/db-$TS.dump" ]] || { echo "dump is empty"; exit 1; }
"${DC[@]}" exec -T postgres pg_restore --list < "$DIR/db-$TS.dump" > /dev/null || { echo "dump failed verification"; exit 1; }
for vol in private_data floorplan_data; do
  if docker volume inspect "${PROJECT}_$vol" >/dev/null 2>&1; then
    docker run --rm -v "${PROJECT}_$vol":/data:ro -v "$DIR":/out alpine:3.20 tar -czf "/out/$vol-$TS.tar.gz" -C /data .
  fi
done
find "$DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name '*_data-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "[$TS] backup ok: $(du -sh "$DIR/db-$TS.dump" | cut -f1) database dump; $(ls "$DIR" | wc -l) files kept in $DIR"
