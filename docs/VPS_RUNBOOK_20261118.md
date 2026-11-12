# VPS runbook — About page overview (01–05)

No database migration. Merge after the Why Exhibit PRs (this work is stacked on them):
backend `feat/why-exhibit-fields` → `feat/about-overview-fields`; frontend `feat/why-exhibit-cards` → `feat/about-overview`.

## 1. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tail -12
```

## 2. Read-only check: does the published English About layout list the section and hide it?
The new design keeps section id `where-possibility-meets` (a renamed section would be hidden by a published layout).
Old field edits (.0–.13, .15, .17, .19–.37) are dropped automatically; date, venue and experience (.14, .16, .18) keep any CMS edit.
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres psql -U imdx -d imdx_uat -Atc "select coalesce((select string_agg(b->>'ref' || case when (b->>'hidden')::boolean then ' (HIDDEN)' else '' end, ', ') from jsonb_array_elements(published->'blocks') b where b->>'type'='static'), 'no published layout') from \"PageLayout\" where \"pageKey\"='about' and locale='en'"
```
Empty result or `no published layout` → the designed page shows as built. If `where-possibility-meets (HIDDEN)` appears, unhide it in CMS → Pages & layout → About.

## 3. Chinese texts (about + exhibitors; safe to re-run)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=about,exhibitors
```

## 4. Check
Open https://uat.imdx.tech/about/ and https://uat.imdx.tech/zh/about/ (hard refresh).
