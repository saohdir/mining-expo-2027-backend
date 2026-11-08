# IMDX 2027 — PRD v1.4 Implementation / UAT Readiness

**Overall status: IMPLEMENTATION IN PROGRESS — NOT READY FOR END-TO-END UAT OR GO-LIVE.** Source code has passed GitHub Actions tests/build, but there is no connected public staging server, database, domain, HTTPS configuration or organizer-approved financial policy in this environment. Green CI is not UAT sign-off.

| Module | Current implementation | Remaining acceptance / operational gates |
| --- | --- | --- |
| Marketing | Existing website converted to UAT content frontend; mock checkout and QR removed | Serve on same authenticated HTTPS origin as Next.js app; review copy, media rights and i18n |
| Customer accounts | One account supports visitor, conference and exhibitor; email OTP and optional SMS adapter; profile dashboard | Configure SMTP/SMS, test OTP abuse controls, recovery, identity changes, privacy notice |
| Visitors | Account-gated registration and individually generated QR pass base | Live event publishing policy, gate/device tests, entry rules, cancellation/revoke paths |
| Conference | Draft conference CMS API, bookings, manual-payment requests and role-scoped approval | Full session management and customer options, capacity protection, fee/tax policy, regression tests |
| Exhibitors | Customer floorplan preferences + free-text m²; admin review/offer; customer acceptance; finance-gated assignment API | Full offer revision UX, availability concurrency constraints, assignment management UI, notifications and UAT |
| Floorplan | Basic CMS editor, booth rectangle properties, images, publish, public viewer | Draft version duplication/rollback, extensive editor tools, gallery rights, concurrency and access testing |
| Finance | Manual payment request, invoice draft/issue, owner-only invoice PDF, WhatsApp share/email outbox, DP/paid verification, prepayment cancellation | Official templates and legal invoice numbers, maker/checker, reversals/refunds, bank reconciliation safeguards, full report exports |
| Admin lists/exports | Role-protected registration records, filters and bounded PDF/Excel export; booth requests and notifications | Export scope/field minimization, 100k row async jobs, robust date basis/filters, operator UAT |
| QR scanner | CMS-only camera and opaque-token validation, name matching, atomic admission records, attendance totals | Scan device and HTTPS test, staff zone assignment, reissue/revoke UI, offline fail-closed tests |
| CMS content | Event controls and conference draft API; marketing pages still static | Full page/article/resource/organizer media editor, bilingual content lifecycle, draft/preview/publish |
| Notifications | Retrying SMTP outbox worker and Mailpit UAT capture | Configure approved providers, monitor delivery, retry errors, no public data leakage |
| Deployment | Docker, Nginx one-origin proxy, PostgreSQL, Mailpit and setup documentation committed | Provision secured VPS/hosting, TLS/DNS, secrets, migrations, backup/restore, real smoke tests |
| Security | Session/auth roles, protected finance endpoints, disabled-by-default feature flags, CI typecheck/build/tests | CSRF/origin enforcement, IP rate limits, secrets management, access audits, upload permissions, security assessment and legal review |

## Governing rules
- No Midtrans / Snap / gateway / automatic checkout / provider webhooks. Manual bank transfer only, confirmed by authorized Finance.
- One account may have multiple roles/registrations; customer booth preferences never constitute a held/owned booth.
- QR tokens are private, scans happen in CMS and admitted participants are counted distinctly from bookings and scan attempts.
- Never accept real customer payments/PII on the static GitHub Pages preview.
- Feature flags `ENABLE_REGISTRATION`, `ENABLE_INVOICES`, `ENABLE_QR_ADMISSION` default to `false`.

## Release acceptance
A UAT deployment requires approved event fees, invoice/tax/DP/refund policy, bank beneficiary, CMS operator identities, dedicated HTTPS UAT subdomain, hosted Postgres, email/SMS provider, server-side backups, complete migrations, organizer test accounts, regression/security tests and documented acceptance across PRD v1.4 FR-001–FR-159. Until then, **do not label the platform UAT-ready**.

See `docs/UAT_DEPLOYMENT.md` for the single-origin deployment recipe.
