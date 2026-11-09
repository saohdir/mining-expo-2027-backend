# VPS runbook — floors: active/inactive, booked by, split booths, clickable dashboard

Run on the VPS as root, in order. Each block is one copy-paste.

## 1. Check, back up, apply the migration
```bash
cd /opt/imdx/mining-expo-2027-backend && git fetch origin main && git show origin/main:scripts/uat-apply-migrations.sh > /root/uat-apply-migrations.sh && bash /root/uat-apply-migrations.sh
```
Expected PENDING: `20261117010000_floor_activation` (plus any earlier one not yet applied).
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres pg_dump -U imdx -d imdx_uat -Fc > /root/imdx-uat-before-floors.dump && bash /root/uat-apply-migrations.sh --apply --backup /root/imdx-uat-before-floors.dump
```
The migration adds columns (floor active flag, "replaces" link, booked-by company/contact, split link), drops the
"one published floorplan per event" index so several floors can be live, and links existing drafts to the current live floor.

## 2. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-floors.txt | tail -12
```

## 3. Check
```bash
curl -s https://uat.imdx.tech/api/health?deep=1; echo; curl -s https://uat.imdx.tech/api/public/floorplan | head -c 200; echo
```
Expected: health ok; the floorplan JSON contains `"floors":[…]`.
In the CMS: Overview cards open their lists; Floorplans → Live floors → pick a floor → Active/Inactive, booked-by, split.

## Rollback
Code: `git checkout <previous main sha>` and re-run step 2. Before going back, make sure only ONE floor per event is live
(set others to a draft/archived state in the CMS), because older code assumes a single live floor.
