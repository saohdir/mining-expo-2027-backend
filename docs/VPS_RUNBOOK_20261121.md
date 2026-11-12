# VPS runbook — Pages & layout editor (named pages, photo upload) + Exhibitors/Visitors tweaks

No database migration. Merge backend `feat/pages-cms-and-exhibitors` and frontend `feat/exhibitors-visitors-tweaks` together.

```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tail -12
```
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=exhibitors
```
Then: CMS → Website content → Downloads → upload the PDFs and publish them. Only published files appear under Exhibitor Downloads; the section is hidden while there are none.
Photos and texts of every page: CMS → Pages & layout → pick the page → "Edit content" on a section → Upload photo / edit text → Save draft → Preview → Publish.
