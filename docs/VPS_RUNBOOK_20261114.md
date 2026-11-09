# VPS runbook — Programme pages (CR-PROGRAMME) + Partners page

Needs, in this order, all merged: backend #26 → #27 → this PR, frontend #6 → #7 → this PR.
Includes a **database migration** (additive) and an **nginx config change** (shipped in `deploy/nginx.conf`, applied by the deploy).

## 1. Check, back up, apply the migration
```bash
cd /opt/imdx/mining-expo-2027-backend && git fetch origin main && git show origin/main:scripts/uat-apply-migrations.sh > /root/uat-apply-migrations.sh && bash /root/uat-apply-migrations.sh
```
Expected PENDING: `20261118010000_programme_items` (plus any earlier one not applied yet).
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres pg_dump -U imdx -d imdx_uat -Fc > /root/imdx-uat-before-programme.dump && bash /root/uat-apply-migrations.sh --apply --backup /root/imdx-uat-before-programme.dump
```

## 2. Deploy (backend + frontend + nginx)
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-programme.txt | tail -12
```

## 3. Content: programmes, organizers, remove sponsorship samples, Chinese texts
```bash
cd /opt/imdx/mining-expo-2027-backend && DC="docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx" && $DC scripts/seed-programmes.ts --confirm && $DC scripts/seed-organizers.ts --confirm && $DC scripts/seed-uat-sample-data.ts --confirm | grep -i "partners page" && $DC scripts/apply-site-content.ts --confirm --publish --page=programme,partners,home,exhibitors
```
Expected: `programmes: 6 created`, `organizers: 10 created`, `partners page: sample sponsorship packages removed`, `published: …` ×4.
The three ICEE reference pages stay DRAFT. Only after the Product Owner approved them (CMS → Programme Pages → Preview):
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-programmes.ts --confirm --approve-legacy
```

## 4. Check
```bash
for p in /programme/ /programme/mining-downstream-industry-green-mining/ /zh/programme/china-indonesia-coal-energy-conference/ /programme/does-not-exist/ /partners/; do printf "%-62s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://uat.imdx.tech$p)"; done
```
Expected: 200, 200, 200, **404**, 200. Then in the browser: /programme/ (cards → detail), /zh/programme/, /partners/, CMS → Programme Pages.

## Rollback
Code: `git checkout <previous main sha>` (both repos) and re-run step 2 — nginx returns to the previous config; the new tables are
unused by old code. Content: CMS → Programme Pages → Unpublish / Restore version; Website Content → Organizers.
