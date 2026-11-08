#!/usr/bin/env bash
# IMDX 2027 — apply pending additive SQL migrations on UAT, in order. Run on the VPS host.
# UAT was created with `db push` (no _prisma_migrations table), so each migration is detected by an object it creates.
#
#   bash uat-apply-migrations.sh                                  # DRY RUN: show APPLIED / PENDING, change nothing
#   bash uat-apply-migrations.sh --apply --backup /root/x.dump    # apply PENDING ones (needs a fresh, valid pg_dump)
#
# SQL is read from git ref $MIGRATIONS_REF (default origin/main; run `git fetch origin main` first) so the working
# tree and the running containers are not touched. Each migration file is one transaction (BEGIN…COMMIT) and psql
# stops at the first error, so a failing migration leaves the database as it was before that file.
set -uo pipefail
BACK="${IMDX_BASE_DIR:-/opt/imdx}/mining-expo-2027-backend"
REF="${MIGRATIONS_REF:-origin/main}"
DBU="${IMDX_DB_USER:-imdx}" DBN="${IMDX_DB_NAME:-imdx_uat}"
DC=(docker compose --env-file "$BACK/.env.uat" -f "$BACK/deploy/compose.uat.yml")
cd "$BACK" || { echo "Missing $BACK"; exit 1; }
APPLY=0 BACKUP=""
while [[ $# -gt 0 ]]; do case "$1" in --apply) APPLY=1;; --backup) BACKUP="${2:-}"; shift;; *) echo "Unknown option $1"; exit 2;; esac; shift; done

# migration name | SQL returning 't' when that migration's objects already exist
MIGRATIONS=(
 "20261108072000_booth_offers|SELECT to_regclass('public.\"BoothOffer\"') IS NOT NULL"
 "20261108090000_floorplan_holds|SELECT to_regclass('public.\"BoothHold\"') IS NOT NULL"
 "20261109010000_finance_controls|SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='Invoice' AND column_name='cancelledAt')"
 "20261109020000_admission_controls|SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='EventPass' AND column_name='revokedAt')"
 "20261109030000_floorplan_editor|SELECT to_regclass('public.\"BoothCategory\"') IS NOT NULL"
 "20261109040000_account_security|SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='OtpChallenge' AND column_name='purpose')"
 "20261109050000_cms_admin|SELECT to_regclass('public.\"Lead\"') IS NOT NULL"
 "20261109060000_engagement|SELECT to_regclass('public.\"WaitlistEntry\"') IS NOT NULL"
 "20261109070000_governance|SELECT to_regclass('public.\"AppSetting\"') IS NOT NULL"
 "20261110010000_customer_password_auth|SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='CustomerAccount' AND column_name='passwordHash')"
 "20261110020000_page_builder|SELECT to_regclass('public.\"PageLayout\"') IS NOT NULL"
 "20261110030000_p1_p2_extensions|SELECT to_regclass('public.\"Invitation\"') IS NOT NULL"
 "20261111010000_p0_remaining|SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='InvoiceItem' AND column_name='kind')"
 "20261112010000_analytics|SELECT to_regclass('public.\"AnalyticsDaily\"') IS NOT NULL"
)
q(){ "${DC[@]}" exec -T postgres psql -U "$DBU" -d "$DBN" -tAq -c "$1" 2>/dev/null | tr -d '[:space:]'; }

git rev-parse --verify -q "$REF" >/dev/null || { echo "Git ref $REF not found. Run: git fetch origin main"; exit 1; }
echo "Database: $DBN   SQL source: $REF ($(git rev-parse --short "$REF"))"
pending=() seen_pending=0 gap=0
for m in "${MIGRATIONS[@]}"; do
  name="${m%%|*}" check="${m#*|}"
  if ! git cat-file -e "$REF:prisma/migrations/$name/migration.sql" 2>/dev/null; then printf '  %-42s NOT IN %s (merge the PR first)\n' "$name" "$REF"; gap=1; continue; fi
  if [[ "$(q "$check")" == "t" ]]; then
    printf '  %-42s APPLIED\n' "$name"; [[ $seen_pending == 1 ]] && gap=1
  else printf '  %-42s PENDING\n' "$name"; pending+=("$name"); seen_pending=1; fi
done
if [[ $gap == 1 ]]; then echo "STOP: a later migration exists while an earlier one is missing (or SQL not on $REF). Review manually."; exit 1; fi
if [[ ${#pending[@]} == 0 ]]; then echo "Nothing to apply."; exit 0; fi
if [[ $APPLY == 0 ]]; then echo "DRY RUN — ${#pending[@]} pending. Nothing was changed. Re-run with --apply --backup <fresh pg_dump file>."; exit 0; fi

# Backup gate: file must exist, be non-empty, < 24 h old and readable by pg_restore.
[[ -n "$BACKUP" && -s "$BACKUP" ]] || { echo "Backup file missing or empty: '$BACKUP'"; exit 1; }
age=$(( $(date +%s) - $(stat -c %Y "$BACKUP") )); [[ $age -lt 86400 ]] || { echo "Backup is older than 24 h. Make a fresh one."; exit 1; }
"${DC[@]}" exec -T postgres pg_restore --list < "$BACKUP" >/dev/null 2>&1 || { echo "pg_restore cannot read $BACKUP — not a valid custom-format dump."; exit 1; }
echo "Backup OK: $BACKUP ($(stat -c %s "$BACKUP") bytes)"

for name in "${pending[@]}"; do
  echo "Applying $name ..."
  if ! git show "$REF:prisma/migrations/$name/migration.sql" | "${DC[@]}" exec -T postgres psql -U "$DBU" -d "$DBN" -v ON_ERROR_STOP=1 -q; then
    echo "FAILED at $name. It was rolled back; earlier migrations stay applied. Nothing after it was run. Send this output for review."; exit 1
  fi
done
echo "All pending migrations applied. Next: deploy code (scripts/deploy-uat.sh), then check /api/health and the worker logs."
