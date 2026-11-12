# VPS runbook — Exhibitors page redesign

No database migration. Stacked on the Why Exhibit → About → Navbar PRs; merge those first.

## 1. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tail -12
```

## 2. Read-only check: section order/visibility in a published English Exhibitors layout
The page keeps its four CMS section ids. The designed order is intro/why → scope → reserve booth (`exhibitor-directory-2`) → downloads.
A published layout overrides that order and can hide sections.
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres psql -U imdx -d imdx_uat -Atc "select coalesce((select string_agg(b->>'ref' || case when (b->>'hidden')::boolean then ' (HIDDEN)' else '' end, ' > ') from jsonb_array_elements(published->'blocks') b), 'no published layout') from \"PageLayout\" where \"pageKey\"='exhibitors' and locale='en'"
```
Empty output or `no published layout` → nothing to do. Otherwise, in CMS → Pages & layout → Exhibitors, move "exhibitor-directory-2" above "exhibitor-downloads", unhide anything marked HIDDEN, and publish.

## 3. Chinese texts (safe to re-run)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=about,exhibitors
```

## 4. Brochure / Invitation download buttons
They show "Coming soon" until a PDF is published in CMS → Website content → Downloads whose title (or slug) contains
"brochure" / "invitation", e.g. "IMDX 2027 Exhibition Brochure". Then the button changes to "Download PDF".
