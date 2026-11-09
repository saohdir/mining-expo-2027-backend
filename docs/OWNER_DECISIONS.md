# Owner decisions — applied under delegated authority (9 Nov 2026)

The Product Owner delegated all open decisions to the development team. Below is what was decided, where it lives and how to
change it. Factual data that only the organizer can supply was **not invented** (see the last table).

| ID | Decision | Applied by | Change later in |
| --- | --- | --- | --- |
| D-13 | Retention: sign-in artifacts 30 d, closed invitations 90 d, rejected scans 180 d, closed enquiries anonymised after 730 d, stale export records 90 d. Accounts/registrations: 24 months after the event (manual purge request), audit log kept | `scripts/apply-owner-decisions.ts` | CMS → Data Retention |
| D-10 | Transfer proofs and all finance records kept 10 years (Indonesian tax/accounting records) — never auto-purged | same (category left unset) | CMS → Data Retention |
| D-01 | VAT line "PPN 12% × DPP 11/12" = 11% effective, on booth and conference invoices (new drafts only). Requires the organizer to be a VAT-registered entrepreneur (PKP) — remove if not | same | CMS → Invoice Taxes & Fees |
| D-09 | Re-entry: one admission per person, zone and day (EXPO_ENTRY, CONFERENCE) | same | CMS → Gates & Passes |
| D-11 | Maker-checker: transfers ≥ IDR 50,000,000 need a second Finance approver | `.env.uat` `FINANCE_APPROVAL_THRESHOLD_MINOR=50000000` | `.env.uat` |
| D-03 | Cancellation/refund policy (conference: ≥30 d → refund less 10%, <30 d → transfer seat; booth: >90 d → 50% retained, ≤90 d → 100%; organizer cancellation → full refund/credit) | legal draft v1.0 in `scripts/i18n/legal.json` | CMS → Pages & layout → terms |
| D-12 | Privacy notice and terms v1.0 (EN + 中文), based on UU PDP No. 27/2022 — prepared draft, legal review recommended before go-live; pages stay `noindex` | `scripts/apply-site-content.ts` | CMS → Pages & layout |
| CR-LANG-01 | Public site languages English + Simplified Chinese (replaces Indonesian) | frontend + `apply-site-content.ts` | CMS → Pages & layout → Language 中文 |
| UAT flags | Enable for UAT testing: `ENABLE_EXHIBITOR_STAFF`, `ENABLE_GROUP_ENROLLMENT`, `ENABLE_BULK_TOOLS`, `ENABLE_SCHEDULED_MAILOUTS`. Keep off: invoices, QR admission, fee estimator (no tariffs), WhatsApp/CRM (no provider) | `.env.uat` | `.env.uat` |

## Not decided — organizer data required
| ID | What is missing | Why it was not invented |
| --- | --- | --- |
| D-01 bank | `APPROVED_BANK_NAME/ACCOUNT_NAME/ACCOUNT_NUMBER` | invoices would send customers' money to a made-up account |
| D-02 | booth/conference prices, DP %, sponsor packages, estimator tariffs | prices are commercial facts; wrong public prices create obligations |
| D-04/D-05 | SMS provider, WhatsApp Business account + approved template | needs the organizer's contracts and credentials |
| FR-005/009 | partner logos with usage rights, approved downloadable files | rights/approvals belong to third parties |
| FR-004 | exhibition category wording vs. the organizer's source PDF | source document not provided |
