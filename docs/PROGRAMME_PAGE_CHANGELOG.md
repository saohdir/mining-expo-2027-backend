# Programme page change request (CR-PROGRAMME) — changelog

Product Owner change request: *IMDX 2027 — Programme Cards, Detail Pages, Pagination, Legacy ICEE Content & CMS Management*
(delivered with the Partners page request of the same day). Status: implemented and tested locally; **not deployed** —
UAT deployment needs reviewer/owner sign-off, a database backup and the migration preflight (see `VPS_RUNBOOK_20261114.md`).

## URLs
| URL | What | Served by |
| --- | --- | --- |
| `/programme/`, `/zh/programme/` | Listing, 3 cards per page, `?page=N` | static `programme/index.html` + `assets/programme.js` |
| `/programme/<slug>/`, `/zh/programme/<slug>/` | Detail page | Nginx serves the static shell `programme/item.html` after an `auth_request` published-check; unknown/unpublished → **HTTP 404** (`404.html`) |
| `/api/public/programmes?locale=en|zh` | Published cards, deterministic order | Next.js |
| `/api/public/programmes/<slug>?locale=…[&preview=1]` | Detail; drafts only with `preview=1` for signed-in staff | Next.js |
| `/api/public/programme-exists` | Nginx check (header `X-Original-URI`) → 204 / 403 | Next.js |
| `/api/admin/programme-items[...]` | CMS list/create, get/update, action (publish/unpublish/archive/delete/restore/approve/rollback), reorder | Next.js, role-protected |
| `/admin/programme-pages` | CMS screen “Programme Pages” (Website group) | Next.js |

`/admin/programmes` (Events & Programmes — bookable conferences, seats, fees) and `/conferences` are **unchanged**.

## Data model (migration `20261118010000_programme_items`, additive)
- `ProgrammeItem` — slug (unique), category, programmeStatus (TBA/CONFIRMED/REFERENCE), status (DRAFT/PUBLISHED/ARCHIVED), isLegacy,
  displayOrder, cover image + rights, eventDate/startTime/endTime/venue/feeLabel/currency **with separate confirmation flags**,
  optional `conferenceId` (FK, `ON DELETE SET NULL`), source provenance (`sourceSystem`, `sourceId`, `sourceUrl`, `sourceTitle`,
  `sourceFacts` JSON), editorialStatus + note, publishedAt, `deletedAt` (soft delete), updatedBy. Unique `(sourceSystem, sourceId)`.
- `ProgrammeTranslation` — per locale (en, zh): title, categoryLabel, summary, overview, highlights[], imageAlt, SEO title/description,
  reviewStatus. Unique `(itemId, locale)`.
- `ProgrammeRevision` — snapshot on every publish; “Restore” in the CMS rolls content back to a version.
Why not `ContentItem` / `Conference`: programme pages need structured, bilingual fields and a fact-confirmation model; `Conference` is
booking inventory (capacity, fee) and must not be changed by editorial copy.

## Rules implemented
- Order: published → regular before legacy → displayOrder → createdAt → id (`compareProgrammes`). Reorder only within a group.
- Pagination: 3 per page; ≤3 → no controls; `?page=` shareable; Back/Forward; invalid/negative/too large → nearest valid page
  (URL corrected with `replaceState`); focus moves to the first card title after a page change; Previous/Next disabled at the ends,
  active page `aria-current="page"`, “Page x of y”.
- Public facts: date/time/venue/fee appear only when the organizer flag is set; otherwise “To be announced”. Source-reported facts
  are stored in `sourceFacts` and shown only in the CMS. Event JSON-LD only with confirmed date + venue; BreadcrumbList always.
- “Register for conference” only when linked to a **published conference of a published event** with registration open
  (capacity/fee from the conference); otherwise “Registration details coming soon” (or “fully booked”). No page action creates
  enrollments, invoices or seats (E2E-verified).
- Roles: write = Super Admin, Content Editor, Operations; confirming facts / linking a conference = Super Admin, Operations;
  editorial approval of imported content = Super Admin (Product Owner); read = all staff roles. Checked server-side.
- Imported/reference items cannot be published before editorial approval; images need alt text (all languages) + approved rights.
- Rendering: all CMS text inserted escaped (XSS test with `<img onerror>` / `<script>` passes); URLs restricted to site paths/https.
- 中文: translation per item; missing 中文 → English content with a visible note and `lang="en"` (no silent mixing).
- Public responses `Cache-Control: max-age=15, s-maxage=30`; the page revalidates (`fetch` `cache: "no-cache"`) so a publish shows on
  the next page load.

## Removed from /programme/ (EN + 中文)
- Section `confirmed-schedule` (“Confirmed schedule”, day filter, list) and its script in `assets/platform.js`.
- Section `all-programmes` (“See all published programmes”).
- Both removed from `src/lib/page-manifest.json`; stored EN/中文 layouts keep their history — `pruneLayout()` drops the stale
  references when layouts are read, saved, published or re-applied. Conference data, `/conferences` and booking are untouched.

## Card / design notes (8 Golden Rules)
| Rule | Where |
| --- | --- |
| Consistency | Same `.conference-card` component, colours, radius, type, tags; detail page uses existing tokens; header/footer untouched |
| Universal usability | Real `<a>` links (card-wide stretched link), keyboard focus ring on the whole card, 44 px pager targets, `aria-current`, `nav aria-label="Pagination"`, reduced-motion, WCAG axe pass on listing + detail (EN, 中文), no horizontal overflow at 360/768/1024/1440 px |
| Informative feedback | Hover lift, focus ring, disabled pager ends, “Page x of y”, skeleton while loading, empty state, CMS success/error banners, “To publish: …” reasons |
| Closure | Detail page heading = card title; CMS publish confirms and offers “View page ↗” |
| Prevent errors | Slug/URL validation, duplicate slug/source blocked, duplicate-title warning, unconfirmed facts never public, publish disabled with reasons |
| Easy reversal | Breadcrumb + “Back to all programmes” (returns to the same page), Unpublish, Restore deleted, Restore version |
| User control | Real navigation, Back/Forward, no auto-redirect to login, no carousel |
| Reduce memory load | Facts grouped (Date/Time/Venue/Admission), visible pagination, breadcrumbs, same titles on card and page; CMS editor in 5 numbered steps |

## Files
Backend: `prisma/schema.prisma`, `prisma/migrations/20261118010000_programme_items/`, `src/lib/programme.ts`, `src/lib/programme-data.ts`,
`src/app/api/public/programmes/**`, `src/app/api/public/programme-exists/route.ts`, `src/app/api/admin/programme-items/**`,
`src/app/admin/programme-pages/page.tsx`, `src/app/admin/components/CmsShell.tsx`, `src/app/admin/cms-refresh.css`,
`deploy/nginx.conf`, `scripts/seed-programmes.ts`, `scripts/uat-apply-migrations.sh`, `scripts/uat-preflight-readonly.sh` (unchanged),
`src/lib/page-manifest.json`, `src/lib/page-fields.json`, `tests/programme.test.ts`, `tests/e2e/programmes.e2e.mjs`,
`tests/e2e/programme.browser.mjs`, `tests/e2e/a11y-axe.browser.mjs`, `tests/e2e/static-proxy.mjs`.
Frontend: `programme/index.html`, `programme/item.html` (new), `assets/programme.js` (new), `assets/programme.css` (new),
`assets/platform.js` (schedule code removed), `sitemap.xml`.
