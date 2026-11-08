# IMDX UAT — Manual code deployment (Hostinger KVM 1)

The project currently runs as two Git checkouts under `/opt/imdx`, with the static marketing site served by Nginx and the Next.js CMS/API in Docker behind Caddy HTTPS at `uat.imdx.tech`. **A push to GitHub does NOT automatically update the VPS.**

Once changes are committed to both main branches and GitHub CI passes, open Hostinger **VPS → Web Console**, then run:

```bash
cd /opt/imdx/mining-expo-2027-backend
bash scripts/deploy-uat.sh
```

The script will refuse modified tracked files or non-main branches, pull each repo with `--ff-only`, rebuild the app and worker sequentially for 4 GB RAM, restart only app/worker/web (not PostgreSQL), and smoke-test `/`, `/account`, `/admin`, `/admin/payments`, `/admin/programmes` and `/api/health`.

- It never prints `.env.uat` and never runs `db push` / migrations. For a future schema change, migrations and backup need their own carefully reviewed deployment step.
- It does not configure Caddy or firewall and does not re-enable feature flags.
- Do not run it from inside a Docker container; run it at the Ubuntu VPS shell prompt.
- If a build fails, keep the existing service and inspect the error. Do not delete Compose volumes or database state.
- Newly built code appears on the **VPS** only after running this script. GitHub Actions passing does not deploy it.

## New CMS routes

- `/admin/payments` — invoice register with straightforward Pending / DP / Paid in full / Cancelled status actions. Verified transfers are logged using the existing audited finance API; cancelled invoices with receipts require a separately approved reversal/refund. Only Finance/Super Admin can change status.
- `/admin/programmes` — admin-managed programme titles, fee/status, dates, capacity and organizer-approved publication.

Both pages follow the public site's Space Grotesk and orange/dark-brown/off-white design tokens. No payment gateway has been added.

**UAT safety:** Keep real payments and real customer PII out of testing. Ensure `ENABLE_INVOICES` remains disabled until organizer-approved bank beneficiary, invoice policies, test-only scenarios and staff controls are configured.
