# IMDX 2027 — PRD v1.4 Implementation / UAT Readiness

**Overall status: IMPLEMENTATION IN PROGRESS — NOT READY FOR END-TO-END UAT OR GO-LIVE.** Source code has passed GitHub Actions tests/build, but the user has provisioned a Hostinger KVM 1 VPS with Docker, PostgreSQL, Caddy and HTTPS at uat.imdx.tech. Application source changes still need deployment to that VPS; organizer-approved financial policy and full UAT test evidence remain outstanding. Green CI is not UAT sign-off.

| Module | Current implementation | Remaining acceptance / operational gates |
| --- | --- | --- |
| Marketing | Existing website converted to UAT content frontend; mock checkout and QR removed | Serve on same authenticated HTTPS origin as Next.js app; review copy, media rights and i18n |
| Customer accounts | One account supports visitor, conference and exhibitor; email OTP and optional SMS adapter; profile dashboard | Configure SMTP/SMS, test OTP abuse controls, recovery, identity changes, privacy notice |
| Visitors | Account-gated registration and individually generated QR pass base | Live event publishing policy, gate/device tests, entry rules, cancellation/revoke paths |
| Conference | Programme editor UI/API, draft/publish approvals, booking capacity checks in serializable transactions, public seat/fee availability, blocked free-programme invoice requests | Full session management, seat contention/load tests on UAT PostgreSQL, approved fee/tax policy, session-level entitlements and end-to-end regression tests |
| Exhibitors | Versioned approved quotations; latest-offer acceptance; staff-only 1–168 h holds, release and worker expiry with audit; Finance-gated atomic assignment; distinct customer hold/assignment status (SQL migration pending) | Apply migrations in correct order on backed-up UAT, end-to-end contention tests, approved cancellation/remap policy, quote/finance and hold-expiry regression |
| Floorplan | Versioned CMS editor, immutable historical editions, clone/restore to new draft, blocked old inventory, explicit unblock with audit, publish preflight + unique published edition constraint (migration pending) | Operator-approved remapping workflow for outstanding bookings; gallery/tooling, drag/keyboard UX, concurrency/recovery and full acceptance testing |
| Finance | Manual Payment Management CMS status UI, invoice draft/issue, owner-only invoice PDF, WhatsApp/email outbox, DP/paid verification, prepayment cancellation | Official templates and legal invoice numbers, maker/checker, reversals/refunds, bank reconciliation safeguards, full report exports |
| Admin lists/exports | Role-protected records, attendance report UI with gate/date metrics, filtered PDF/Excel registration export, booth requests and notifications | Export scope/field minimization, 100k row async jobs, robust date basis/filters, operator UAT |
| QR scanner | CMS-only camera and opaque-token validation, name matching, atomic admission records, attendance totals | Scan device and HTTPS test, staff zone assignment, reissue/revoke UI, offline fail-closed tests |
| CMS content | Event controls and conference draft API; marketing pages still static | Full page/article/resource/organizer media editor, bilingual content lifecycle, draft/preview/publish |
| Notifications | Retrying SMTP outbox worker and Mailpit UAT capture | Configure approved providers, monitor delivery, retry errors, no public data leakage |
| Deployment | Hostinger UAT VPS and HTTPS confirmed by operator; deployment update script committed | Pull/rebuild latest commits on VPS, verify live endpoints, security gate, database backups, restore and E2E smoke tests |
| Security | Session/auth roles, protected finance endpoints, disabled-by-default feature flags, CI typecheck/build/tests | CSRF/origin enforcement, IP rate limits, secrets management, access audits, upload permissions, security assessment and legal review |

## Governing rules
- No Midtrans / Snap / gateway / automatic checkout / provider webhooks. Manual bank transfer only, confirmed by authorized Finance.
- One account may have multiple roles/registrations; customer booth preferences never constitute a held/owned booth.
- QR tokens are private, scans happen in CMS and admitted participants are counted distinctly from bookings and scan attempts.
- Never accept real customer payments/PII on the static GitHub Pages preview.
- Feature flags `ENABLE_REGISTRATION`, `ENABLE_INVOICES`, `ENABLE_QR_ADMISSION` default to `false`.

## Release acceptance
Full UAT sign-off requires approved event fees, invoice/tax/DP/refund policy, bank beneficiary, role provisioning, verified HTTPS UAT environment, email/SMS provider, server-side backups, complete migrations, organizer test accounts, regression/security tests and documented acceptance across PRD v1.4 FR-001–FR-159. Until then, **do not label the platform UAT-ready**.

See `docs/UAT_DEPLOYMENT.md` for the single-origin deployment recipe.
