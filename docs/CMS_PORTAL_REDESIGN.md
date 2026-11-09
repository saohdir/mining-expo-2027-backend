# CMS & customer portal redesign (Nov 2026)

Presentation-layer redesign of the Admin CMS (Directus-inspired) and the customer portal (Swapcard-inspired), using the IMDX
brand (orange `#C2410C`, navy `#141C28`). **No database migration, no change to authentication, authorisation, booking,
invoice/maker-checker, QR or check-in logic.** Existing API responses are unchanged; three list endpoints accept extra,
optional query parameters and one read-only endpoint was added.

## Admin CMS

| Area | Change |
|---|---|
| Navigation (`components/CmsShell.tsx`) | Grouped by job: People, Exhibition, Finance, On-site, Conferences, Website, Insights, plus a collapsible **Settings** group. Duplicate entries removed (Booth units → Booth requests, Check-ins → Reports, Payment requests → Invoices). Role filters per item unchanged; every API still checks roles. |
| Breadcrumb | One breadcrumb per page, generated from the navigation (page-level breadcrumbs are hidden). |
| Quick search | `Ctrl+K` / `⌘K` or `/` focuses the existing global search. |
| Lists (`components/DataList.tsx`) | URL-backed filters (shareable, Back/Forward), sortable headers (`aria-sort`), filter chips, pager with totals, **saved views** and **column choice** (stored in the browser), **bulk bar**, skeleton/empty/error states, CSV of the selected rows. |
| Customers | Table with search, status filter, sort, pagination (was capped at 30 without paging), detail opens as a drawer (`?id=`, Esc closes). "Mark duplicate" now needs a confirmation step. |
| Registrations | Same toolkit; **bulk review** sends each selected record through the existing per-record review endpoint (same policy checks and audit entry) after a confirmation step, with a per-record result. |
| Booth requests | Server-side search, status filter, sort and pages (was the latest 100 only); deep links `?request=` still open a record outside the page. |
| Invoices (workspace finance) | **Customer picker**: search a customer, then choose one of their conference bookings or booth requests. Manual ID entry remains under "Enter IDs manually". Save stays disabled until both are chosen. |
| Overview | "Needs action" and **Recent activity** first, then the KPI cards and notifications. |
| Website content | Status chips; Archive asks for confirmation. |
| Styling | `cms-2027.css` (loaded last): compact sidebar, quieter tabs, no orange on non-action list rows, full sidebar from 1024 px, icon rail 768–1023 px, drawer on phones. |

### API additions (all optional, defaults unchanged)

- `GET /api/admin/customers`: `pageSize` (10/25/30/50/100), `sort` (`created|name|email|status` + `:asc|:desc`), `status`.
- `GET /api/admin/registrations`: `sort` (`created|customer|type|status` + direction).
- `GET /api/admin/booth-requests`: with `page` → paged mode returning `total, page, pageSize` (+ `pageSize`, `q`, `sort=created:asc|desc`); without `page` the original latest-100 response.
- `GET /api/admin/activity` (new, read-only): latest staff actions scoped to the record types of the caller's role (Super Admin: all). Returns action, record type, short reference, time and colleague name only — no payloads, no sign-ins or list views. Check-in staff: 403.

## Customer portal

| Area | Change |
|---|---|
| Navigation | Side navigation on desktop (Home, My pass, Conferences, Booth, Invoices, Documents, Profile) with a **QR pass shortcut**; bottom bar on phones with the pass in the middle. Section ids and `/account?tab=…` links are unchanged. |
| Home | Action needed → journeys (existing) → **Event preparation checklist** (built from data already loaded) and **Recent updates** (existing customer timeline API). |
| Documents (new tab) | Invoices and receipts (PDF), QR pass download, and documents published in CMS → Website content → Downloads. |
| Copy | Internal wording removed from the Invoices page; payment instructions written for customers. |

## Tests

- `tests/e2e/redesign.e2e.mjs`: list parameters, defaults, paged booth requests, activity scoping and 403 for check-in staff.
- `tests/e2e/redesign.browser.mjs`: navigation without duplicates, Settings group, Ctrl+K, breadcrumb, sort/search in the URL, drawer + Esc, bulk bar, customer picker, tablet sidebar; portal navigation, checklist, documents, phone bottom bar, no horizontal scroll, sign-out on phones.
- Source-check unit tests updated to the new navigation names and booth-list signature (same intent).

## Deploy

Code-only: rebuild/redeploy the app as usual. No migration, no content seed, no data change.
