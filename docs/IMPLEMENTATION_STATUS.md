# IMDX 2027 — PRD v1.4 readiness register

**Status: IN DEVELOPMENT / NOT YET READY FOR UAT SIGN-OFF OR GO-LIVE.** These statuses denote code additions, not end-to-end QA completion.

| Area | Current state | Remaining |
| --- | --- | --- |
| Marketing frontend | Static site adapted as UAT source | Same-origin dynamic UAT deployment pending; GitHub Pages is not the UAT |
| Customer account | Email OTP and SMS provider adapter, account dashboard | Integrations, account recovery, IP throttling, identity change and tests |
| Visitor / conference | Registration and QR pass issuance basis | Catalog/session CMS, payment eligibility and capacity UAT |
| Exhibitor | Published floorplan preference and free-text m² request | Offer acceptance/revision, complete booking timeline and all concurrency tests |
| Floorplan CMS | Basic visual draw/drag/size, image upload, publish | Version duplication, rollback, grid tools and full rights sanitization |
| Invoice and finance | Draft, issue, ledger verification, DP/paid and pre-payment cancellation | Official invoice PDF, maker-checker, refunds, statement import, outbox delivery |
| CMS | Registrations list, booth review, invoices, notifications | Full event content editing, conference/content/news/media modules |
| Exports | PDF/XLSX basic bounded export by period/type | Scalable async jobs, report scopes, all filters and download policy |
| Scanner | CMS-only QR scanner, atomic zone/day admissions | Device/browser/gate tests, staff gate constraints, reissue/revoke UI |
| Deployment | Docker/Nginx/DB/Mailpit instructions | No server, DNS, certificates or real staging environment provisioned |
| Security | Auth roles and fail-closed feature toggles | Origin/CSRF controls, audit coverage, penetration, retention, backups, migrations |

No Midtrans / payment gateway dependency is part of this implementation. Financial confirmation is restricted to CMS Finance.
