# IMDX 2027 — Admin CMS Dashboard v2 design alignment

Reference requested by product owner: `DESIGN-DASHBOARD-Admin-IMDX.md` (v2, 8 Nov 2026).
Visual source-of-truth: `DESIGN.md` and `tokens.json` (Valid Landing Page 2025), as referenced by the specification.
This implementation is a **design-system + existing feature UX slice**, not an assertion that all PRD v1.4 CMS modules are implemented.

## Implemented on this branch
- A shared `/admin` nested layout across every existing CMS route; prevents mixing the public marketing header, duplicate page headers, and inconsistent sidebar styles.
- Token-prefixed light theme: Space Grotesk, cream `bg-page`, off-white cards, orange accents, 4px chips/buttons, 8px cards, 16px larger panels. A11y contrast guard: small chip text uses `text-primary`; orange buttons use dark text.
- Persistent responsive role-filtered sidebar grouped Main / Finance / Operations / Insights / Content / System, desktop 260px, tablet 72px, mobile drawer.
- Topbar search with role-scoped server lookups, role identity, notification dropdown and site return link; secure UAT environmental warning.
- `/admin` new Overview: real server aggregates with inclusive WIB period filters and labeled measure basis, role-specific KPIs, action queue + notification inbox. No illustrative counts from the first 100 list records.
- `/admin/registrations` filterable server-paginated registry, responsive record cards, domain-specific status chips, exports sharing search/type/status/date filters.
- `/admin/booths` detail view compares requested preferences, organizer offer and physically assigned units in three visibly distinct cards; domain-labeled booth/invoice/payment/assignment states and a separate paid-but-unallocated warning.
- `/admin/payments` replaces the decorative 4-card payment status legend with a compact Finance verification panel and distinct invoice/payment states.
- `/admin/notifications` inbox and limited safe delivery diagnostics.
- `/admin/audit` Super Admin read-only history with before/after snapshots.
- Existing form workflows preserved at `/admin/workspace?section=...`. Existing `/admin/payments`, `/admin/booths`, `/admin/floorplans`, `/admin/programmes`, `/admin/reports`, `/admin/check-in` inherit shared shell and scoped token styling.
- Scanner decision panel updated to use text + icon + reserved scanner colors; erroneous or rejected scans never reveal identity in the panel.
- Security correction: Super Admin notifications no longer leak into inboxes of unrelated staff roles.

## Screens and QA
- 1440px desktop: 260px sidebar, 80px topbar, cream content canvas, four KPI columns, two-panel action/inbox layout.
- 768px tablet: 72px icon rail, two KPI columns, one-column detail panels.
- 402px and 360px mobile: overlay drawer, 64px topbar, single KPI column, stacked registry cards (no horizontal scroll).
- Tab through sidebar/search/filters, test Escape in search, sidebar mobile, contrast of secondary text, focus rings, zoom 200%, reduced motion.
- Role smoke test: SUPER_ADMIN, SALES, FINANCE, OPERATIONS, CONTENT_EDITOR, CHECKIN_STAFF, VIEWER. Check menus are omitted when unauthorized, **but enforce data policy in API as well**. Account/finance scope policies beyond existing backend permissions remain PRD work.
- Compare against attached v2 design source and actual `https://uat.imdx.tech/` for logo, type, spacing and contrast. The reference design file specifies behavior, not screenshots, so some exact compositions require visual acceptance.

## Current limitations relative to attached specification
- Sidebar links only to **functioning routes** and some existing legacy workspace sections. Full 20+ page sitemap is not complete (Customers detail, invoice editor/preview, staff management, content/media, reconciliation, check-in reports, export jobs).
- Overview uses validated, source-labeled metrics; some requested full finance totals/maker-checker and check-in eligibility metrics are deferred rather than inventing unsupported values.
- Global search results navigate to functional module indexes. Individual record detail routes and field-level scopes remain outstanding.
- Global period filters currently cover Overview, while module-specific date/record filters remain on their respective pages; no forced cross-module filter synchronization.
- Scanner backend must still enforce gate assignments and retry throttling before live use; merely hiding/validating UI fields does not enforce security.
- Existing floorplan editor does not yet implement full desktop-only resize/rotate/undo/import or automatic overlap detection.
- No payment gateway, no auto-verified transfers, no actual UAT/production go-live activation, no DB migration in this redesign.

## Release
Only the prior backend migrations require schema changes; this CMS redesign changes **no Prisma schema**.
Merge only after green GitHub Actions, review screenshots at 1440/768/402/360px, and validate roles on the actual UAT server.

When the VPS has the latest approved migration from previous PRs, the usual manually triggered deployment remains:

```bash
cd /opt/imdx/mining-expo-2027-backend
git status -sb
git pull --ff-only origin main
bash scripts/deploy-uat.sh
```

Do not deploy code against outdated Prisma schema. Never `docker compose down -v`, force-reset local changes, or enable real user payment features before full organizer sign-off.
