# VPS runbook — Visitors page redesign

No database migration. Stacked on Why Exhibit → About → Navbar → Exhibitors PRs; merge those first.

## 1. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tail -12
```

## 2. Read-only check: sections in a published English Visitors layout
Designed order: `your-access` (intro, at a glance, why visit) > `from-interest-to-entry` (exhibition scope) > `questions-we-ve-got-you` (FAQ + plan your visit).
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres psql -U imdx -d imdx_uat -Atc "select coalesce((select string_agg(b->>'ref' || case when (b->>'hidden')::boolean then ' (HIDDEN)' else '' end, ' > ') from jsonb_array_elements(published->'blocks') b), 'no published layout') from \"PageLayout\" where \"pageKey\"='visitors' and locale='en'"
```
Empty output or `no published layout` → nothing to do; otherwise unhide/reorder in CMS → Pages & layout → Visitors.

## 3. Chinese texts (about, exhibitors, visitors; safe to re-run)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=about,exhibitors,visitors
```
