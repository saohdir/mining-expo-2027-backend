# IMDX 2027 — Floorplan draft restore & temporary hold UAT rollout

This is an incremental PRD v1.4 implementation of floorplan version safety and **Operations-only** expiring booth holds. It does **not** perform automatic remapping, transfer customer financial history, or change confirmed assignments across versions.

## Critical prerequisite

PR #3 introduced `BoothOffer` and the `BoothAssignment_one_active_per_unit` index. **Confirm that the previous SQL migration has actually been applied on the VPS** before considering this change. Merging a PR does not apply any database schema. The new worker depends on the new `BoothHold` table; do not deploy application/worker before it exists.

Neither the existing `scripts/deploy-uat.sh` nor GitHub Actions runs database migrations.

## Backup and verification — Hostinger Ubuntu VPS host (not inside a container)

Only after reviewing and merging this PR, during an approved UAT maintenance window:

```bash
cd /opt/imdx/mining-expo-2027-backend
git status -sb
git pull --ff-only origin main
mkdir -p /root/imdx-backups
chmod 700 /root/imdx-backups
BACKUP="/root/imdx-backups/imdx-before-holds-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  pg_dump -U imdx -d imdx_uat -Fc > "$BACKUP"
test -s "$BACKUP" && chmod 600 "$BACKUP" && echo "Backup created"
```

Verify that the prior schema is present (the first `SELECT` should succeed and print the table name; if it doesn't, stop and follow the previous PR's migration instructions):

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  psql -U imdx -d imdx_uat -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.\"BoothOffer\"');"
```

**Preflight must have no duplicate published floorplans:**

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  psql -U imdx -d imdx_uat -c 'SELECT "eventId", COUNT(*) FROM "Floorplan" WHERE "status" = '\''PUBLISHED'\'' GROUP BY "eventId" HAVING COUNT(*) > 1;'
```

Do not automatically delete/merge duplicate plans or assignments. Resolve them with Operations and written approval.

## Apply the incremental migration (once, after verified backup)

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres \
  psql -U imdx -d imdx_uat -v ON_ERROR_STOP=1 \
  < prisma/migrations/20261108090000_floorplan_holds/migration.sql
```

It creates `BoothHold`, a partial unique index preventing overlapping **active** holds for one unit, and a partial unique index ensuring only one **published** floorplan per event. The SQL runs in one transaction.

Then:

```bash
bash scripts/deploy-uat.sh
```

**No `docker compose down -v`, `git reset --hard`, or repeated `prisma db push`.** UAT was initially provisioned with `db push`, so production migration baselining must still be reconciled before using `prisma migrate deploy`. Test recovery from the database dump privately, and keep all UAT financial/registration feature flags disabled until explicitly approved.

## Operator test checklist

1. Create a draft from an old published/archived floorplan. Original plan and booking/assignment IDs are unchanged. Newly copied RESERVED, BLOCKED or OCCUPIED units start BLOCKED.
2. Operations explicitly unblocks copied draft units with an audit reason; no historical assignment changes. Keep published version intact.
3. Publish preflight must report counts of open requests, active holds, and active assignments. Publication of a replacement map is blocked if **any unresolved request** exists, not just paid ones. There is intentionally no force override.
4. With zero blockers, publish only after approving the layout and submitting rowVersion + audit reason. Verify only one published edition remains per event; losing concurrent updates must return 409.
5. Issue a test organizer quote, accept as customer, then create a 1–168 hour hold via **OPERATIONS**. All quoted available units become RESERVED atomically; account shows a temporary hold, **not** paid or assigned.
6. Another Operations request cannot hold/assign the same physical units. Direct customer preference and SALES quotation do not reserve inventory.
7. Release active holds with an audit reason, check inventory returns to AVAILABLE only if no active assignment. Create a short hold and verify worker expiry/Operations alert, including safety against simultaneous assignment.
8. Assignment from a matching unexpired hold is possible only after Finance verifies the applicable payment policy; it creates OCCUPIED assignments atomically, consumes the holds, and never changes bank payment state.
9. Verify /account, /admin/booths, /admin/floorplans at desktop/mobile sizes, all roles, and the server-side audit trail. Repeat concurrency and backup/restore scenarios on test-only data.

## Known limits and next PRD work

There is **no automated paid-booking remap between floorplans**, no authorized inventory transfer from old unit IDs, no self-service hold for customers, and no automatic invoice/DP cancellation on hold expiry. Version publication therefore fails closed until Operations resolves commitments under an approved manual policy. The background worker checks expiry every ~20 seconds; final UAT concurrency and disaster-recovery tests remain mandatory. This is not a go-live sign-off.
