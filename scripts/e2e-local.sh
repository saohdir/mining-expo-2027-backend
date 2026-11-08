#!/usr/bin/env bash
# Local API E2E for PRD v1.4 flows on a DISPOSABLE PostgreSQL database.
# Recreates the database named in E2E_DB (default imdx_e2e) — never point at UAT.
# Needs: PostgreSQL reachable via E2E_PG (psql connection args), Node 22.
set -euo pipefail
cd "$(dirname "$0")/.."
PG="${E2E_PG:--h localhost -p 5432 -U postgres}"
DB="${E2E_DB:-imdx_e2e}"
WORK="${E2E_WORK:-/tmp/imdx-e2e}"
PORT="${E2E_PORT:-3100}"
mkdir -p "$WORK/uploads"; : > "$WORK/mail.jsonl"
psql $PG -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://postgres@localhost:5432/$DB}"
# Mirror UAT history: db push of the pre-PR#3 schema, then the incremental SQL files.
git show 40f2ce8:prisma/schema.prisma > "$WORK/base.prisma" 2>/dev/null && {
  npx prisma db push --schema "$WORK/base.prisma" --skip-generate >/dev/null
  for m in prisma/migrations/*/migration.sql; do psql $PG -d "$DB" -v ON_ERROR_STOP=1 -q -f "$m"; done
} || npx prisma db push --skip-generate >/dev/null
npx prisma generate >/dev/null
npx tsx prisma/seed.ts
E2E_ALLOW_TEST_ADMINS=true npx tsx tests/e2e/seed-test-admins.ts
node tests/e2e/smtp-sink.mjs "$WORK/mail.jsonl" & SINK=$!
export OTP_HASH_SECRET=local-test-only-otp-secret-0123456789abcdef QR_ENCRYPTION_KEY=local-test-only-qr-key-0123456789abcdefgh
export PUBLIC_BASE_URL="http://localhost:$PORT" ENABLE_REGISTRATION=true ENABLE_INVOICES=true ENABLE_QR_ADMISSION=true ALLOW_BOOTH_ALLOCATION_ON_DP=false FINANCE_APPROVAL_THRESHOLD_MINOR=50000000 OTP_IP_LIMIT_PER_HOUR=100000
export EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_FROM="IMDX E2E <e2e@localhost>" ADMIN_NOTIFICATION_EMAIL=ops@test.local SMS_PROVIDER=disabled
export APPROVED_BANK_NAME="TEST BANK" APPROVED_BANK_ACCOUNT_NAME="TEST ONLY" APPROVED_BANK_ACCOUNT_NUMBER=0000000000 FLOORPLAN_UPLOAD_DIR="$WORK/uploads" PRIVATE_FILE_DIR="$WORK/private"
[[ "${E2E_SKIP_BUILD:-}" == 1 ]] || npm run build >/dev/null
NODE_ENV=production npx next start -p "$PORT" > "$WORK/app.log" 2>&1 & APP=$!
trap 'kill $APP $SINK 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/api/health" >/dev/null && break; sleep 1; done
E2E_SHOTS="$WORK" E2E_BASE_URL="http://localhost:$PORT" E2E_MAIL_FILE="$WORK/mail.jsonl" node --test --test-concurrency=1 ${E2E_FILES:-tests/e2e/*.e2e.mjs tests/e2e/*.browser.mjs}
