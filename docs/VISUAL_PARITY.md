# IMDX 2027 — Portal / CMS visual parity checklist (PRD v1.4)

Reference: the version-controlled public marketing frontend at https://github.com/saohdir/mining-expo-2027-demo.
The deployed reference https://uat.imdx.tech/ should be reviewed manually before approval.

## Implemented in this change
- Shared public marketing header on all secure Next.js routes (account and CMS), using the official logo image served by the static Nginx frontend.
- Ribbon, Space Grotesk typography, orange/brown/off-white design tokens, desktop dropdown hierarchy and mobile disclosure menu.
- Scoped portal/CMS styling for editorial headings, consistent cards, forms and CTA hierarchy.
- Customer booth selection now has a keyboard-accessible list synchronized with the SVG map. Selection changes preference only, never assignment.
- No new API, database migration, payment processor or business-state mutation.

## QA before merging / releasing
1. Run GitHub Actions tests, TypeScript check and production build.
2. Verify the logo at /assets/imd-logo-orange.webp resolves from both static and Next.js routes on the single UAT origin.
3. Compare 1440, 1024, 768 and 390px layouts with public homepage: nav height, type, spacing, dropdowns, CTAs and colors.
4. Test keyboard Tab, Enter and Escape; mobile menu expansion, focus outlines and reduced motion.
5. Test /account as guest and verified test user across visitor, conference and booth journeys. Existing auth and feature flags must be retained.
6. Test /admin, /admin/payments, /admin/programmes, /admin/floorplans and /admin/reports with authorized staff roles.
7. Test a published floorplan: choosing via SVG or list must select the same available unit; unavailable units remain disabled.
8. Never use live payments or real customer PII on UAT. Transfers are manual; FINANCE alone can verify payment.
9. Review organizer-owned media, policy approvals and copy before release. PRD v1.4 remains draft.

## Remaining project work
Bilingual EN/ID routes, CMS content lifecycle, complete booking timelines, floorplan rollback/versioning, payment corrections/refunds, security hardening, report export acceptance, E2E tests and organizer UAT sign-off remain open. This change does not implement all FR-001–FR-159 and is not go-live ready.

## Deployment
No automatic deployment is enabled. After a reviewed merge and green CI, run the documented deployment script at /opt/imdx/mining-expo-2027-backend/scripts/deploy-uat.sh on the VPS host. It preserves PostgreSQL and does not toggle features or run schema migrations.
