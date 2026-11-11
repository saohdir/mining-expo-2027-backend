# VPS runbook — Website Content fixes (PDF downloads, block editor)

No database migration. Backend and frontend PRs must both be merged to `main` first. `deploy/nginx.conf` changed: the deploy script restarts `web`, which loads it.

## 1. Deploy
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-content.txt | tail -12
```

## 2. Check
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T web nginx -T 2>/dev/null | grep -c "location = /api/admin/files"; curl -sI "https://uat.imdx.tech/api/public/content?kind=NEWS" | grep -i cache-control; for p in / /news/ /api/public/content; do printf "%-28s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://uat.imdx.tech$p)"; done
```
Expected: `1`, `cache-control: public, max-age=0, must-revalidate`, then 200 three times.

Then, signed in as Super Admin or Content Editor:
1. Go to CMS → Website content → Downloads → Upload PDF → Save draft → Publish.
2. Go to News & updates → Edit an article: the old text appears as blocks. Add a heading or quote → Preview → Save changes → open the article on /news/.
