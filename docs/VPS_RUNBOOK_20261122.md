# VPS runbook — page banners in the CMS, /floorplan banner, About Organizer, About redesign

No database migration. Merge backend `feat/hero-cms-organizer` and frontend `feat/hero-cms-organizer` together.

## 1. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tail -12
```

## 2. Chinese texts of the changed / new pages (safe to re-run; only these pages)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=about,about-organizer,visitors
```
(Page banners on the other pages already show Chinese from the page itself.)

## 3. Check
- https://uat.imdx.tech/about/ , /about-organizer/ , /floorplan , /visitors/ (hard refresh)
- Navbar › About › About Organizer
- CMS › Pages & layout › pick a page › "Page banner" card: upload photo / edit title & subtitle → Save draft → Preview → Publish
