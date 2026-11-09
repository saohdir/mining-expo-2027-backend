# CMS — Pages & layout (public website)

`/admin/pages` lets SUPER_ADMIN and CONTENT_EDITOR manage the content and layout of every public page
(`/`, `/about/`, `/exhibition/`, `/exhibitors/`, `/visitors/`, `/programme/`, `/the-venue/`, `/news/`, `/highlights/`,
`/partners/`, `/contact/`, `/privacy/`, `/terms/`). Other staff roles can view.

## What editors can do
- **Reorder / hide / re-add** the designed sections of a page (each section of the static site carries `data-cms-block`).
- **Add blocks:** hero banner, text (paragraphs + bullets), cards grid, call to action, image, key figures, FAQ,
  CMS list (partners, downloads, news, gallery, contacts from Website Content).
- **SEO:** page title and meta description.
- **Draft → Preview → Publish:** drafts are visible only to signed-in staff via `?cmsPreview=1`; publishing needs a reason
  and creates an immutable version. **Rollback** restores any version (as a new version) or the original design.
- English and Indonesian layouts; Indonesian falls back to English when not published.

## Safety
- Content is rendered as **text only** (no HTML/scripts); links must be site paths, `https://` or `mailto:`; images need alt text
  (upload via Website Content → asset upload, which enforces rights status).
- Public endpoint `/api/public/pages/[key]` returns only the published layout (cached ≤60 s); a page with nothing published shows the original design.
- Every save/publish/rollback is audited.

## Files
Backend: `src/lib/page-layout.ts`, `src/lib/page-manifest.json` (section ids of the static site), `src/app/api/admin/pages/*`,
`src/app/api/public/pages/[key]`, `src/app/admin/pages/page.tsx`, migration `20261110020000_page_builder`.
Frontend: `data-cms-page` / `data-cms-block` attributes and the renderer in `assets/platform.js`.
When a new section is added to the static site, give it a `data-cms-block` id and add it to `page-manifest.json`.

## Editing text, links and images inside designed sections (and header/footer)
Every designed section's text leaves, links and images carry a stable key (`data-cms-f="block.N"`) stamped into the static HTML.
In **Pages & layout**, a designed section shows **Edit content (n)**; the page **(all pages: header & footer)** edits the shared
navigation and footer on every page. Overrides are stored in the page layout (`fields`), go through the same draft → preview →
publish → rollback flow and are rendered by the frontend as text nodes only (no HTML). Field modes: `plain`; `rich` (new line =
line break, `*x*` italic, `**x**` bold); `own` (text beside an icon — the icon is kept). Empty value = keep the designed text.

When the static HTML changes, re-stamp and refresh the manifest (existing keys are never renumbered):

    node scripts/cms-fields.mjs ../mining-expo-2027-demo --stamp   # writes keys into new elements + src/lib/page-fields.json
    node scripts/cms-fields.mjs ../mining-expo-2027-demo           # check only (exit 1 if unstamped/stale)

Commit the frontend HTML and `src/lib/page-fields.json` together. Overrides whose key disappears are rejected on the next save.

## News & updates (home "Exhibition insights & updates", /news/, article pages)
CMS → Website Content → **News & updates**: each published item is a card (3 per page, with pagination) and opens
`/news/article/?slug=<slug>` (`/zh/news/article/?slug=…` in Chinese). Fields: title, slug, card label, order, summary, article text
(blank line = paragraph, `## ` = subheading, `- ` = bullet), cover image + alt text + rights. Add a 中文 item with the same slug for the
Chinese site (English is shown when there is none). **Edit** opens any item in the form; changes to published items are live after saving.
The designed cards in the static HTML are only a fallback when no news is published. Starter articles: `scripts/seed-news-articles.ts --confirm`.

## Programme pages (/programme/ cards and /programme/<slug>/)
CMS → **Programme Pages** (`/admin/programme-pages`): structured programme pages in English and 中文 — card summary, overview,
highlights, cover image, facts with organizer-confirmation flags, optional link to a bookable conference, source provenance, editorial
review, publish / unpublish / archive / delete / restore, reorder (regular first, reference/legacy always last), version restore.
Details: `docs/PROGRAMME_PAGE_CHANGELOG.md`. Bookable seats and prices stay in Events & Programmes (`/admin/programmes`).

## Organizers & media partners (/partners/, home)
CMS → Website Content → **Organizers** / **Media partners**: logo cards (logo, name, optional role, order). Media Partners is hidden
on the site while none is published.
