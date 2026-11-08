# IMDX 2027 — UAT dynamic application

This repository contains the **secure server-side application** for IMDX 2027 PRD v1.4.
Its sibling repository mining-expo-2027-demo contains public marketing pages to be served on the SAME UAT domain, not a separate payment demo.

- /account — unified customer identity, visitor/conference/exhibitor and invoices
- /admin — role-authorized registrations, booth requests, payments, reports and notifications
- /admin/floorplans — CMS floorplan editor
- /admin/check-in — CMS-only QR scanner
- /api/* — secured API

**Manual bank transfer ONLY. No payment gateway, automatic checkout or webhooks.**

No public dynamic UAT server is deployed yet and not all 159 PRD v1.4 requirements are complete.
Read docs/IMPLEMENTATION_STATUS.md and docs/UAT_DEPLOYMENT.md before activating participant signups.
