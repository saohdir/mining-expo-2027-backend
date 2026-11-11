# VPS runbook — Why Exhibit cards on /exhibitors/

No database migration. Merge backend `feat/why-exhibit-fields` and frontend `feat/why-exhibit-cards` first.

## 1. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tail -12
```

## 2. Read-only check: was Why Exhibit text edited in the CMS? (an edit there overrides the new design text)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres psql -U imdx -d imdx_uat -Atc "select coalesce(string_agg(k, ', '), 'none') from \"PageLayout\", jsonb_object_keys(coalesce(published->'fields','{}'::jsonb)) k where \"pageKey\"='exhibitors' and locale='en' and k ~ '^make-your-next-connection\.(9|1[0-7])$'"
```
`none` → nothing to do. If keys are listed, open CMS → Pages & layout → Exhibitors → Why Exhibit, reset or replace those texts, and publish.

## 3. Chinese texts of the new cards (only the exhibitors page; safe to re-run)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=exhibitors
```

## 4. Check
Open https://uat.imdx.tech/exhibitors/ and https://uat.imdx.tech/zh/exhibitors/ (hard refresh).
