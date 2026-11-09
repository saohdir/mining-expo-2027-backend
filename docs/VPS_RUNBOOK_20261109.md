# VPS runbook — 9 Nov 2026 release (CR-LANG-01, legal v1.0, owner decisions, FR-154/059, NFR fixes)

Run on the Hostinger VPS as root, in order. Every step is safe to re-run. Each block is one copy-paste.

## 1. Backup, then apply the two new migrations
```bash
cd /opt/imdx/mining-expo-2027-backend && git fetch origin main && git show origin/main:scripts/uat-apply-migrations.sh > /root/uat-apply-migrations.sh && bash /root/uat-apply-migrations.sh
```
Expected: everything APPLIED except `20261113010000_lang_zh` and `20261114010000_mailouts_discounts` (PENDING).
```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T postgres pg_dump -U imdx -d imdx_uat -Fc > /root/imdx-uat-before-20261109-release.dump && bash /root/uat-apply-migrations.sh --apply --backup /root/imdx-uat-before-20261109-release.dump
```

## 2. Environment decisions (D-11 maker-checker, UAT feature flags)
```bash
cd /opt/imdx/mining-expo-2027-backend && cp .env.uat /root/env.uat.before-20261109 && { [ -z "$(tail -c1 .env.uat)" ] || echo >> .env.uat; } && for kv in FINANCE_APPROVAL_THRESHOLD_MINOR=50000000 ENABLE_EXHIBITOR_STAFF=true EXHIBITOR_STAFF_LIMIT=5 ENABLE_GROUP_ENROLLMENT=true ENABLE_BULK_TOOLS=true ENABLE_SCHEDULED_MAILOUTS=true; do k=${kv%%=*}; if grep -q "^$k=" .env.uat; then sed -i "s|^$k=.*|$kv|" .env.uat; else echo "$kv" >> .env.uat; fi; done && grep -E "^(FINANCE_APPROVAL_THRESHOLD_MINOR|ENABLE_[A-Z_]+|EXHIBITOR_STAFF_LIMIT)=" .env.uat
```
Invoices, QR admission, fee estimator, CRM and WhatsApp stay off (no bank/prices/providers yet).

## 3. Deploy code (backend + frontend + nginx)
```bash
cd /opt/imdx/mining-expo-2027-backend && bash scripts/deploy-uat.sh 2>&1 | tee /root/imdx-deploy-20261109.txt | tail -12
```

## 4. Publish prepared content (Chinese site + legal v1.0) and apply owner decisions
```bash
cd /opt/imdx/mining-expo-2027-backend && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-site-content.ts --confirm --publish && docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/apply-owner-decisions.ts --confirm
```

## 5. Check
```bash
curl -s https://uat.imdx.tech/api/health?deep=1; echo; curl -s -o /dev/null -w "zh home %{http_code}\n" https://uat.imdx.tech/zh/; curl -s "https://uat.imdx.tech/api/public/pages/home?locale=zh" | head -c 160; echo
```
Expected: `"database":"ok","worker":"ok"`, `zh home 200`, and a JSON layout containing Chinese text.
In the browser: https://uat.imdx.tech/zh/ (中文), the EN / 中文 switch, /privacy/ and /terms/ (v1.0), CMS → Settings Status, Data Retention, Invoice Taxes & Fees, Pre-registration & Badges (scheduled e-mails).

## Rollback (if needed)
- Code: `git -C /opt/imdx/mining-expo-2027-backend checkout <previous main sha>` (same for the frontend) and re-run step 3.
- Content: CMS → Pages & layout → choose page + language → Restore original design.
- Environment: `cp /root/env.uat.before-20261109 /opt/imdx/mining-expo-2027-backend/.env.uat` and re-run step 3.
- Database: migrations are additive; full restore from `/root/imdx-uat-before-20261109-release.dump` only if instructed.
