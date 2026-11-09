# VPS runbook — navbar, sign-in popup, home cards, Event Highlight gallery

Contains a **database migration**, a **Docker image change (ffmpeg)** and a **new volume for uploaded media**.

## 0. Save media uploaded since the last deploy (CMS images live inside the current app container until now)
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app sh -c 'mkdir -p /var/lib/imdx/media && tar -C /var/lib/imdx -cf - media' > /root/imdx-media-before-gallery.tar; ls -lh /root/imdx-media-before-gallery.tar
```

## 1. Check, back up, apply the migration
```bash
cd /opt/imdx/mining-expo-2027-backend && git fetch origin main && git show origin/main:scripts/uat-apply-migrations.sh > /root/uat-apply-migrations.sh && bash /root/uat-apply-migrations.sh
```
Expected PENDING: `20261119010000_event_gallery` (plus `20261118010000_programme_items` if the previous release was not applied).
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres pg_dump -U imdx -d imdx_uat -Fc > /root/imdx-uat-before-gallery.dump && bash /root/uat-apply-migrations.sh --apply --backup /root/imdx-uat-before-gallery.dump
```

## 2. Deploy (image rebuild with ffmpeg takes a few minutes longer)
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-gallery.txt | tail -12
```

## 3. Put the saved media into the new volume
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app sh -c 'tar -C /var/lib/imdx -xf -' < /root/imdx-media-before-gallery.tar && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app sh -c 'ls /var/lib/imdx/media | head; which ffmpeg'
```

## 4. Content (safe to re-run): programmes, news, organizers, Chinese texts of the changed pages
```bash
cd /opt/imdx/mining-expo-2027-backend && DC="docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx" && $DC scripts/seed-programmes.ts --confirm && $DC scripts/seed-news-articles.ts --confirm && $DC scripts/seed-organizers.ts --confirm && $DC scripts/apply-site-content.ts --confirm --publish --page=site,home,news,contact,highlights,programme,partners,exhibitors
```

## 5. Check
```bash
for p in / /programme/mining-downstream-industry-green-mining/ /programme/does-not-exist/ /highlights/ /api/public/gallery /contact/ /news/; do printf "%-52s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://uat.imdx.tech$p)"; done
```
Expected: 200, 200, 404, 200, 200, 200, 200. Then: CMS → Event Gallery → add a year → upload photos/videos → publish → /highlights/.
