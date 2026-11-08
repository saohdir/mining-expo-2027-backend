# IMDX v1.4 — safe UAT rollout for booth offers & assignment uniqueness

This change requires **PostgreSQL schema changes**. It must NOT be deployed by running the normal `deploy-uat.sh` alone on an existing UAT database. Keep registration, invoicing and QR admission flags disabled during validation, and do not accept real funds or customer PII.

## Deployment preflight

1. Review/merge the Pull Request and ensure all GitHub tests pass. Arrange a maintenance window, and verify the current app/database backup & restore procedure.
2. On the **Hostinger VPS Ubuntu host**, not inside the app container, pull the reviewed `main` branch:

```bash
cd /opt/imdx/mining-expo-2027-backend
git status -sb
git pull --ff-only origin main
```

3. Back up UAT PostgreSQL before running SQL. The following creates a host-side database dump and does **not** expose the database password:

```bash
mkdir -p /root/imdx-backups
chmod 700 /root/imdx-backups
BACKUP="/root/imdx-backups/imdx-uat-before-booth-offers-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  pg_dump -U imdx -d imdx_uat -Fc > "$BACKUP"
test -s "$BACKUP" && chmod 600 "$BACKUP" && echo "Backup created"
```

If any step fails, **stop**. Do not delete volumes, run `db push --accept-data-loss`, or reset the database. Retain the backup privately; never paste its contents here.

4. Check historic duplicate active unit assignments:

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  psql -U imdx -d imdx_uat -c 'SELECT "boothUnitId", COUNT(*) FROM "BoothAssignment" WHERE "active" = TRUE GROUP BY "boothUnitId" HAVING COUNT(*) > 1;'
```

This query must return **zero records**. Any duplicates must be reconciled by Operations and documented before applying SQL. No automatic deletion is acceptable.

5. With an approved backup and zero duplicate active assignments, apply the **reviewed** SQL file **once**:

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  psql -U imdx -d imdx_uat -v ON_ERROR_STOP=1 \
  < prisma/migrations/20261108072000_booth_offers/migration.sql
```

Verify the table and uniqueness index exist:

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  psql -U imdx -d imdx_uat -c '\d "BoothOffer"'
```

6. Now rebuild the Next.js app and worker using the existing documented script:

```bash
bash scripts/deploy-uat.sh
```

7. UAT smoke test `/account`, `/admin`, `/admin/booths`, `/admin/payments` and `/api/health` on the HTTPS domain. Do not enable real registrations or payment flags as part of code deployment.

## Required test scenarios before approval

- Create new request on a published floorplan; preferred units remain **AVAILABLE**.
- Sales/Operations starts review and issues revised offer with 2 available units. Quote price is explicit (no auto-computed public price), offered area equals physical unit sum.
- Customer sees preferred vs offered units, total quote, expiry, version and accepts the **exact latest offer ID**. Old/expired offers must return conflict.
- Before Finance verification, Operations attempts assignment: must return 409. Provisional offer cannot reserve inventory.
- With a test invoice equal to accepted quote and test VERIFIED transfer, Operations assigns all quoted units atomically.
- Two independent, concurrently authorized assignment attempts against same unit must never produce two active assignments; unique index remains effective.
- Previously occupied units cannot be included in a new offer/assignment. A stale published floorplan must fail safely, with remap procedure pending design.
- CMS attempts to set OFFERED or ACCEPTED using legacy status API must fail.
- Test mobile/keyboard access, permissions (SALES can quote, FINANCE verifies, OPERATIONS assigns, customers accept own offers only), and audit history.

## Migration status and production caveat

Initial UAT setup used `prisma db push`, with no formal baseline migrations for the existing tables. The SQL file in this change is an **incremental, explicitly applied UAT migration**, not authorization to run `prisma migrate deploy` against this database. Create/reconcile a Prisma migration baseline before production; review drift and backup/restore with a database owner.

The partial unique index protects at most one **active** assignment per booth unit. The app also performs transactional availability checks. This PR does **not** implement formal expiring holds, draft-plan rollback/remapping, commercial tax/DP approval or legal sign-off. Those remain separate PRD v1.4 work items.
