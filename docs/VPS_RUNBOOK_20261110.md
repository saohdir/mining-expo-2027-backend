# VPS runbook — prospect report + portal/CMS redesign

Run on the Hostinger VPS as root, in order. Every step is safe to re-run. Each block is one copy-paste.

## 1. Check migrations, back up, apply
```bash
cd /opt/imdx/mining-expo-2027-backend && git fetch origin main && git show origin/main:scripts/uat-apply-migrations.sh > /root/uat-apply-migrations.sh && bash /root/uat-apply-migrations.sh
```
Expected PENDING: `20261116010000_marketing_consent` (and `20261115010000_participant_details` if the previous release was not applied yet).
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres pg_dump -U imdx -d imdx_uat -Fc > /root/imdx-uat-before-prospects.dump && bash /root/uat-apply-migrations.sh --apply --backup /root/imdx-uat-before-prospects.dump
```

## 2. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-prospects.txt | tail -12
```

## 3. Sample data: add sample participants / set their contact permission
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-uat-sample-data.ts --confirm 2>&1 | grep -i particip
```
Expected: either `participants: 12 visitors …` (first time) or `… future-contact consent set on 15` (existing samples; 0 on a re-run).
Registrations, CMS edits and real customers are not touched.

## 4. Check
```bash
curl -s https://uat.imdx.tech/api/health?deep=1; echo
```
In the browser: CMS → Insights → Participant Prospects; customer portal https://uat.imdx.tech/account (overview journeys).

## Rollback
Code: `git checkout <previous main sha>` and re-run step 2. The migration only adds two columns with defaults; old code ignores them.
