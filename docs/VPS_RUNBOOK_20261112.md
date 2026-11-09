# VPS runbook — exhibitors page refresh (why exhibit, 8-card scope grid, PDF download cards, Chinese)

No database migration. Needs BOTH pull requests merged (frontend `mining-expo-2027-demo` + backend).

## 1. Deploy (backend + frontend)
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-exhibitors.txt | tail -12
```

## 2. Publish the Chinese texts of the exhibitors page (only this page; other pages untouched)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=exhibitors
```
Expected: `published: exhibitors` and `Done: … field overrides across 1 pages (published).`

## 3. Check
https://uat.imdx.tech/exhibitors/ and https://uat.imdx.tech/zh/exhibitors/ (wait up to 60 s for the page cache).
