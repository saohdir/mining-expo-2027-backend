# Programme + Partners change request — QA report

Date: 9 Nov 2026 · Environment: local test stack (Next.js production build, PostgreSQL 16 test DB, the repository's
`deploy/nginx.conf` run in nginx 1.24 with only upstream/root/port substituted, Chromium via Playwright 1.63, Node 22).
**Not yet tested on the Hostinger UAT** — that requires deploy approval; run the checks in `VPS_RUNBOOK_20261114.md` after deploy.

## Automated results
| Suite | Result |
| --- | --- |
| Full E2E (API + browser, frontend served) | **132 / 132 pass** (incl. new `programmes.e2e.mjs`, `programme.browser.mjs`, updated `a11y-axe.browser.mjs`) |
| Unit tests | 97 / 97 pass (new `tests/programme.test.ts`) |
| TypeScript / ESLint / build | pass / 0 errors / pass |
| Prisma schema vs. migrations replay (drift) | no drift |
| CMS field manifest check (`cms-fields.mjs`) | 554 fields, 0 unstamped, up to date |
| GitHub Actions | see the backend PR |

## Acceptance checklist (Section J)
| Check | Result | Evidence |
| --- | --- | --- |
| Existing three cards first, order 1-2-3; each detail link → correct title/content | PASS | `programmes.e2e` test 1, `programme.browser` |
| ICEE IDs 4, 3, 2 imported at the end, no duplicates on re-seed | PASS | seed run twice → `0 created`; order asserted after approval |
| 3 → no pagination; 6 → 2 pages; 7 → 3 pages; 0 → empty state; (unit) 0,1,3,4,6,7,9,10 → 1,1,1,2,2,3,3,4 pages | PASS | browser + unit |
| Desktop: three equal-width cards in one row; 360/768/1024/1440 px no horizontal overflow | PASS | browser asserts widths/tops; overflow ≤ 1 px |
| Previous/Next, numbers, `?page=` state, Back/Forward, clamp (999, -3, abc), focus to first card title | PASS | browser |
| Image, title and arrow open the internal detail route (never /account or external) | PASS | browser (real mouse click on each) |
| Detail: breadcrumb, H1, cover, overview, highlights, facts (TBA unless confirmed), provenance box for reference pages, canonical, hreflang, title | PASS | browser |
| 404 for invalid / unpublished slug (real HTTP 404 through nginx and the test proxy); draft preview only for staff | PASS | curl through nginx; browser; e2e |
| EN / 中文 on listing and detail; EN fallback flagged, not silently mixed | PASS | browser, e2e |
| CMS create / edit / publish / unpublish / archive / delete / restore / reorder / approve / rollback; permissions; validation; preview; audit | PASS | `programmes.e2e` test 2, browser CMS round-trip |
| New published programme appears automatically in the right position/page | PASS | e2e (new regular item sorts before legacy) |
| Page cannot change conference price/capacity; no enrollment/invoice created; Register only for published + open conference | PASS | `programmes.e2e` test 3 |
| “Confirmed schedule” and “See all published programmes” absent EN + 中文 with published CMS layouts | PASS | browser |
| No breakage elsewhere (CMS pages, booking, account portal, header/nav, footer, home, APIs) | PASS | full suite 132/132 |
| Accessibility: axe WCAG 2.2 AA — no serious/critical on /programme/, detail page, /partners/ (EN + 中文) | PASS | `a11y-axe.browser` |
| XSS: `<img onerror>` / `<script>` in title/summary rendered as text, no script ran | PASS | browser |
| Console / page errors during browser tests | none | browser asserts `pageerror` list empty |

## Partners page
| Check | Result |
| --- | --- |
| H2 “Organizer & Partners”; kicker “ORGANIZERS & INDUSTRY NETWORK” and the disclaimer paragraph removed | PASS |
| “Media Partners” section with logo cards identical to the organizer cards (hidden while none is published) | PASS |
| “Partner or sponsor IMDX 2027” and “Sponsorship packages (sample)” removed | PASS |
| Organizer cards come from CMS → Website Content → Organizers (order, logo, name; EN + 中文) | PASS |
| 中文: 主办方与合作伙伴 / 媒体合作伙伴 / 世信国际会展集团 | PASS |

## Known limitations / open items
1. **Not verified on UAT yet** (deploy pending approval). After deploy: check `curl -I https://uat.imdx.tech/programme/<slug>/` = 200,
   unknown slug = 404, `/zh/programme/<slug>/` = 200, and that the `web` container's nginx has `auth_request` (official
   `nginx:1.27-alpine` includes it).
2. Detail pages are a static shell filled by JavaScript; title/meta/canonical/OG/hreflang/JSON-LD are set client-side (Google renders JS;
   some social previewers will show the generic title). Status codes are real (nginx).
3. ICEE reference pages remain DRAFT until the Product Owner approves (and decides the #4 duplicate-title question).
4. Image rights for all programme photos are “owner-supplied, not independently verified”.
5. Media Partners on UAT will show the six existing *sample* partner logos until they are replaced/unpublished in the CMS.
6. Revision rollback restores content of published versions; draft-only edits have no version history (audit log only).
