# Gmail SMTP for IMDX UAT (email OTP)

The public signup/sign-in endpoint sends a 6-digit OTP synchronously from the Next.js `app` service. The `worker` also sends booking and invoice notifications. **Both services must use the same SMTP settings.** This setup is for organizer-approved, test-only UAT. Gmail is not a recommended bulk transactional sender for public go-live.

## Google account
1. Use a dedicated, administrator-controlled Gmail account.
2. Enable Google **2-Step Verification**.
3. Generate an **App Password** at https://myaccount.google.com/apppasswords (requires eligible account; may be unavailable for Advanced Protection / some Workspace policies).
4. Never use the main Google account password or paste an App Password into tickets, GitHub, screenshots, or terminal diagnostics.

## VPS environment — private file only

On Hostinger's Ubuntu VPS host, in `/opt/imdx/mining-expo-2027-backend/.env.uat`, configure:

```dotenv
EMAIL_PROVIDER=smtp
SMTP_FROM="IMDX 2027 UAT <your.sender@gmail.com>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.sender@gmail.com
SMTP_PASS=YOUR_GOOGLE_APP_PASSWORD_WITHOUT_SPACES
```

`ENABLE_REGISTRATION=true` is required for **both register and login OTP**, but must stay false until the organizer approves limited test accounts and privacy/access control. Keep `ENABLE_INVOICES=false`, `ENABLE_QR_ADMISSION=false` unless separately approved.

**Do not change `deploy/compose.uat.yml` locally or commit secrets.** The tracked Compose config now takes email host/from/port/provider from `.env.uat` with safe Mailpit defaults and passes user/password from `env_file`. Previous Compose code hardcoded Mailpit for both services.

## Apply safely after this fix PR is merged

```bash
cd /opt/imdx/mining-expo-2027-backend
git status -sb
git pull --ff-only origin main
chmod 600 .env.uat
docker compose --env-file .env.uat -f deploy/compose.uat.yml up -d --no-deps --force-recreate app worker
docker compose --env-file .env.uat -f deploy/compose.uat.yml restart web
```

Do not use `down -v` or reset database. If other backend changes from PR #3/#4 haven't been migrated, verify schema and apply with backup before rolling out unrelated code; this SMTP PR has **no database migration**.

Check **nonsensitive** container values:

```bash
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app sh -lc 'printf "provider=%s host=%s port=%s\n" "$EMAIL_PROVIDER" "$SMTP_HOST" "$SMTP_PORT"'
docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T worker sh -lc 'printf "provider=%s host=%s port=%s\n" "$EMAIL_PROVIDER" "$SMTP_HOST" "$SMTP_PORT"'
```

These should both show `smtp smtp.gmail.com 587`. Never print `SMTP_PASS`.

Use one permitted dummy Gmail account via https://uat.imdx.tech/account to request an OTP, then check the inbox and spam folder. This route sends directly; the outbox worker is for other notifications. Don't disable security/rate limits. If the site says `DELIVERY_UNAVAILABLE`, inspect bounded app logs with `docker compose ... logs --tail=50 app`; credentials are intentionally not logged. Typical failures: wrong App Password, SMTP egress blocked, unverified sender, or Google account restrictions. For hosted mail deliverability at scale, use an approved transactional provider with domain SPF/DKIM/DMARC.

**Reminder:** The user's earlier UAT screenshot exposed database/session/OTP/QR secrets; rotate these separately under a backup/maintenance plan. Password changes to PostgreSQL must update the live database role and env together, not just the env file.
