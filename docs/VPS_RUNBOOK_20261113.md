# VPS runbook — home clean-up + news articles with detail pages

No database migration. Merge in this order: exhibitors PRs (backend #26 + frontend #6) first, then this pair.

## 1. Deploy (backend + frontend)
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-news.txt | tail -12
```

## 2. Create the three news articles (EN + 中文) from the current home cards — existing slugs are never overwritten
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-news-articles.ts --confirm
```

## 3. Publish the Chinese texts of the changed pages (home + exhibitors, other pages untouched)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish --page=home,exhibitors
```

## 4. Check (wait up to 60 s for caches)
https://uat.imdx.tech/#news (cards + pagination), click a card → article page; https://uat.imdx.tech/zh/ (中文).
New articles: CMS → Website Content → News & updates → fill title, label, summary, article text, cover image → Save draft → Publish.
