# UAT Deployment — Same-origin platform

**Status: repository deployment recipe ONLY. No staging server or public UAT domain has been deployed.**

Clone both repos as siblings: mining-expo-2027-demo (marketing HTML) and mining-expo-2027-backend (Next.js account/CMS/API). This Nginx setup serves marketing at /, customer portal at /account, CMS at /admin, and APIs at /api on one domain.

## Prerequisites
- Controlled staging VPS with Docker, Compose, valid HTTPS certificate and public DNS name; Nginx in this compose binds to localhost:8080 only. Put a secure TLS reverse proxy in front of it, forwarding X-Forwarded-Proto: https.
- Copy .env.example to .env.uat in backend. Replace all secret values; never commit .env.uat. Approve business policy for prices, DP, bank payee, refunds, role permissions, event dates and privacy before activating any financial actions.
- Run PostgreSQL and Mailpit via Compose. Mailpit captures UAT OTP email (127.0.0.1:8025); do not expose it on public internet. Real SMS requires an approved paid provider.

## Commands

    cp .env.example .env.uat
    # edit secrets and set PUBLIC_BASE_URL to HTTPS staging domain
    docker compose --env-file .env.uat -f deploy/compose.uat.yml up -d --build
    docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app npx prisma db push
    docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app npm run db:seed
    docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app npm run admin:create

Prisma db push is an initial UAT setup step, not a production migration strategy. Review drift and backups before repeat runs. Do not use --accept-data-loss. Build migrations before go-live.

## Verification
- /api/health returns manual-transfer-only capability; UAT flags default disabled.
- One account requests visitor, conference and booth independently; cannot auto-assign booth.
- OTP is single use/expiring and delivered to local Mailpit for testing.
- Finance authorizes transfers based on verified bank statement test data, not proof upload.
- CMS can issue invoice; report XLSX/PDF export reflects WIB date filters and audit actions.
- QR scanning is CMS-only over HTTPS and rejects replay, cancelled passes, wrong zone and invalid identity.
- Floorplan uploads persist in floorplan_data Docker volume, never in public GitHub Pages.
- Before real users: approve security hardening, consent/legal, SMTP/SMS, backups/restore, ledger reconciliation, role model, retention, tests, migration review and owner UAT sign-off.

No user data or bank payments should be accepted until approved release gates are met. See docs/IMPLEMENTATION_STATUS.md.
