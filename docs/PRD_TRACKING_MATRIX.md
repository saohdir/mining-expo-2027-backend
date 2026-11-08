# IMDX 2027 — PRD v1.4 Requirement Tracking Matrix

**Baseline:** backend `main` 1039279 + PR #9 + PR #10 (branch `feat/prd14-completion`), frontend `main` 337e04c. **Date:** 8 Nov 2026.
**Evidence keys:** `E2E` = `tests/e2e/*.e2e.mjs` on real PostgreSQL (`scripts/e2e-local.sh`, CI job `e2e`); `BR` = Playwright browser test; `UT` = unit/static test; `CODE` = code read only.

| Status | Meaning |
| --- | --- |
| **VERIFIED** | COMPLETED & VERIFIED — implemented end-to-end and proven by an automated test listed |
| **UNVERIFIED** | IMPLEMENTED BUT UNVERIFIED — code exists end-to-end, no automated proof yet |
| **PARTIAL** | PARTIALLY IMPLEMENTED — key acceptance items missing |
| **NOT** | NOT IMPLEMENTED |
| **BROKEN** | BROKEN / REGRESSION |
| **BLOCKED** | BLOCKED by owner decision (D-xx) or access; fail-closed default kept |

UAT verification of all rows is **pending** (S0-01 DB migration state unknown). No row is UAT-accepted.

## Summary (updated per slice — see bottom changelog)

| Module | VERIFIED | UNVERIFIED | PARTIAL | NOT | BLOCKED |
| --- | --- | --- | --- | --- | --- |
| see per-row status | | | | | |

## A. Public website & content (FR-001–018, FR-024/027/030, FR-034–039)

Frontend is static HTML (`mining-expo-2027-demo`), English only, no CMS binding.

| FR | P | Status | Evidence | Gap / missing acceptance | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-001 | P0 | PARTIAL | static nav/footer on 12 pages | no locale switch / ID pages, breadcrumb; keyboard audit | i18n, D-12 | P0 |
| FR-002 | P0 | PARTIAL | index.html hero | CTAs must reach real `/account` flows | — | P0 |
| FR-003 | P0 | NOT | — | WIB countdown with ongoing/ended states | — | P0 |
| FR-004 | P0 | UNVERIFIED | exhibition/index.html | verify 8 categories vs source PDF | D-12 | P1 |
| FR-005 | P0 | PARTIAL | partners/index.html static | CMS-editable organizers/partners with approval | content CMS | P0 |
| FR-006 | P0 | PARTIAL | programme/index.html + `/api/public/events` | detail pages from CMS data; no invented fields | — | P0 |
| FR-007 | P0 | PARTIAL | exhibitors/index.html | CTA to account booth request | — | P0 |
| FR-008 | P0 | UNVERIFIED | the-venue/index.html | Maps link check | — | P1 |
| FR-009 | P0 | NOT | — | download center (label/type/size/updated) | content CMS, D-12 | P0 |
| FR-010 | P0 | PARTIAL | contact/index.html static | contact form persists + notifies; contacts as CMS config | leads | P0 |
| FR-011 | P0 | PARTIAL | og:title present | per-locale description, canonical, JSON-LD Event, sitemap/robots | i18n | P0 |
| FR-012 | P0 | PARTIAL | consent checkbox in account | privacy/terms pages + footer links | D-12 legal text | P0 (BLOCKED text) |
| FR-013 | P1 | PARTIAL | news/index.html static | draft/published news CMS | content CMS | P1 |
| FR-014 | P1 | NOT | — | exhibitor directory from approved assignments | FR-110 | P1 |
| FR-015 | P0 | VERIFIED | `/floorplan` public viewer (search, legend, list fallback, request CTA) — BR 360px; E2E public API | — | — | — |
| FR-016 | P1 | PARTIAL | highlights/index.html | gallery categories/lightbox; rights | D-12 | P1 |
| FR-017 | P1 | NOT | — | partner packages + lead CTA | leads | P1 |
| FR-018 | P1 | NOT | — | schedule listing w/ date filter | D-02 | P1 |
| FR-024 | P0 | NOT | — | contact/partnership lead form leadType CONTACT/PARTNER | — | P0 |
| FR-027 | P0 | PARTIAL | OTP: honeypot + per-destination/IP rate limit (E2E) | public contact/lead form (Slice A) | — | P0 |
| FR-030 | P1 | NOT | — | UTM capture | — | P1 |
| FR-034 | P0 | PARTIAL | `PATCH /api/admin/events` publish flags | event settings/pages/content blocks CRUD | — | P0 |
| FR-035 | P0 | PARTIAL | conferences CRUD | partners, exhibit scopes, downloads CRUD | — | P0 |
| FR-036 | P0 | NOT | — | lead inbox NEW/CONTACTED/QUALIFIED/CLOSED + audit | FR-024 | P0 |
| FR-037 | P0 | PARTIAL | floorplan image upload (MIME/size/sharp) | general asset upload + alt text | — | P0 |
| FR-038 | P0 | PARTIAL | conference draft/published | preview for authorized only | — | P0 |
| FR-039 | P1 | NOT | — | news/exhibitor/gallery CMS | — | P1 |

## B. Accounts, identity & customer (FR-019/020/025/026/043/068–070/114–119/150/152, AT-057–061/086/089)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-019 | P0 | VERIFIED | E2E business-flow (customer sees own requests/invoices/assignment) | — | — | — |
| FR-020 | P0 | VERIFIED | `/api/health` MANUAL_TRANSFER_ONLY; E2E invoice/verify; no PSP code | — | — | — |
| FR-025 | P0 | UNVERIFIED | Zod `.strict()` on all routes, `failure()` field issues | per-field UI error E2E | — | P1 |
| FR-026 | P0 | VERIFIED | consent literal(true) on booth/registration; E2E | — | — | — |
| FR-043 | P0 | VERIFIED | E2E anon booth request 401; all customer routes `customer()` | — | — | — |
| FR-068 | P0 | PARTIAL | email OTP E2E (single-use, expiry, attempts, rate limits); SMS via Twilio flag | SMS path untested pending provider | D-04 | P0 (BLOCKED) |
| FR-069 | P0 | VERIFIED | `/api/customer/me` owner-only; E2E foreign PDF/accept 403/404 | — | — | — |
| FR-070 | P0 | PARTIAL | profile fullName/org/job/country | phone in profile; snapshot per booking exists | — | P1 |
| FR-114 | P0 | VERIFIED | E2E: one account → visitor + conference + booth | — | — | — |
| FR-115 | P0 | PARTIAL | OTP hashed, 5 min, 5 attempts, per-destination + per-IP throttle (configurable), anti-enumeration decoy (E2E) | enable/disable provider from CMS settings (Slice H) | — | P1 |
| FR-116 | P0 | VERIFIED | contact change: recent auth ≤15 min, OTP to NEW target, other sessions revoked, old email alerted (E2E AT-086) | trusted recovery when channel lost (manual via organizer) | D-04 | — |
| FR-117 | P0 | UNVERIFIED | account/page.tsx action cards | E2E of hub | — | P1 |
| FR-118 | P0 | VERIFIED | profile edits audited before/after; enrollment snapshots; customer timeline API (E2E) | — | — | — |
| FR-119 | P0 | UNVERIFIED | account/page.tsx tabs | action-needed banners verify | — | P1 |
| FR-150 | P0 | PARTIAL | consent version/time stored | retention/purge, data request intake | D-13 | BLOCKED (policy) |
| FR-152 | P0 | PARTIAL | channel choice at OTP | notification preference | D-05 | P1 |
| AT-057 | — | VERIFIED | E2E safe return path + account intent restore (selected booth preselected after OTP) | — | — | — |

## C. Visitor & conference registration (FR-022/023/029/042/054/071–073/133/155)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-022 | P0 | VERIFIED | E2E cms-regression visitor → CONFIRMED + pass | — | — | — |
| FR-023 | P0 | VERIFIED | E2E auth-account: paid conference stays SUBMITTED on DP, CONFIRMED + passes on full payment, suspended on reversal (`CONFERENCE_ACCESS_ON_DP` opt-in) | — | D-02 | — |
| FR-029 | P0 | UNVERIFIED | registration returns id/status | reference display E2E | — | P1 |
| FR-042 | P0 | PARTIAL | feeMinor null = TBA; no gateway | admission mode per package | D-02 | P1 |
| FR-054 | P0 | VERIFIED | visitor free: no invoice/transfer created (E2E) | — | — | — |
| FR-071 | P0 | VERIFIED | duplicate per user/program 409 (E2E), serializable capacity | — | — | — |
| FR-072 | P0 | VERIFIED | confirmed conference → CONFERENCE pass + EXPO_ENTRY if none (E2E) | per-session zones (FR-157, P1) | — | — |
| FR-073 | P0 | VERIFIED | no conference pass until full payment by default; DP does not grant (E2E) | — | D-08/D-09 | — |
| FR-133 | P0 | PARTIAL | `/api/public/events` | snapshot + alert on schedule change | — | P1 |
| FR-155 | P1 | NOT | — | waitlist / reservation expiry | — | P1 |

## D. Exhibitor booking & booth (FR-021/044/053/055/060–067/099–103/138–145)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-021 | P0 | VERIFIED | E2E booth request; stale plan 409 | — | — | — |
| FR-044 | P0 | PARTIAL | customer sees offer/invoice | review summary with deposit/terms | D-02 | P1 |
| FR-053 | P0 | VERIFIED | E2E quote/accept/assign separated | — | — | — |
| FR-055 | P0 | VERIFIED | partial unique index + E2E double-assign 409, concurrent scans | — | — | — |
| FR-060 | P0 | PARTIAL | `/account` booth form | dedicated localized route | i18n | P1 |
| FR-061 | P0 | VERIFIED | E2E (units, area, consent, notes) | zone preference field | — | P1 |
| FR-062 | P0 | VERIFIED | free-text m² (validateArea) | — | — | — |
| FR-063 | P0 | VERIFIED | E2E request stored + outbox BOOTH_REQUEST_RECEIVED | — | — | — |
| FR-064 | P0 | VERIFIED | E2E status/offer/hold/assign independent + audit | — | — | — |
| FR-065 | P0 | VERIFIED | E2E invoice must equal accepted quote | revision/void flow → FR-131 | — | — |
| FR-066 | P0 | VERIFIED | identical booth retry within 10 min returns same request (E2E); duplicate units 400; registrations dedupe | email acknowledgement includes reference (outbox) | — | — |
| FR-067 | P0 | PARTIAL | `/api/admin/reports/export` | booth-specific filters (zone, m², payment, assignment) | — | P0 |
| FR-099 | P0 | VERIFIED | E2E assign requires reason; payment cannot assign | — | — | — |
| FR-100 | P0 | VERIFIED | DB partial unique index (migration #3) + E2E | — | — | — |
| FR-101 | P0 | VERIFIED | assign → 409 AREA_MISMATCH unless override reason; audited (E2E) | — | — | — |
| FR-102 | P0 | VERIFIED | E2E holds 1–168h, release, worker expiry (UT) | — | — | — |
| FR-103 | P0 | VERIFIED | public name only when active assignment approvedForPublic (public API) | logo rights (NFR-12) | D-12 | — |
| FR-138 | P0 | PARTIAL | account selector list+SVG | hall/zone/available filters | — | P0 |
| FR-139 | P0 | VERIFIED | free decimal m² E2E (18, 9) | — | — | — |
| FR-140 | P0 | VERIFIED | snapshot + notification (E2E) | — | — | — |
| FR-141 | P0 | VERIFIED | E2E preference never reserves; revised offer accept | — | — | — |
| FR-142 | P0 | VERIFIED | E2E quote/hold/assign | — | — | — |
| FR-143 | P0 | VERIFIED | booth card requested/offered/assigned/invoice + timeline (`/api/customer/timeline`) | — | — | — |
| FR-145 | P0 | VERIFIED | E2E statuses, partial unique, rowVersion 409 | — | — | — |

## E. Floorplan (FR-090–098, 104–113, 144)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-090 | P0 | VERIFIED | E2E draft/publish/clone; one published index | rollback = clone archived (E2E clone) | — | — |
| FR-091 | P0 | PARTIAL | PNG/JPG/WebP, 15 MB, 8000 px; alt text + rightsStatus required before publish (E2E) | SVG upload remains disabled until sanitizer approved; PDF rejected | — | P1 |
| FR-092 | P0 | VERIFIED | BoothCategory CRUD (HEX, pattern, order), seeded purple/pink/blue; SVG pattern fills; E2E RBAC | WCAG contrast audit of custom colours | — | — |
| FR-093 | P0 | PARTIAL | draw/drag/duplicate/rotate 90°/grid snap/undo-redo/keyboard arrows+Delete (BR covers draw/drag/save) | free-form resize handles (numeric w/h only) | — | P1 |
| FR-094 | P0 | VERIFIED | code, categoryId, dimensionLabel, lengthM, widthM, auto area (editable), hall/zone, status, internal notes (E2E) | — | — | — |
| FR-095 | P0 | VERIFIED | out-of-canvas incl. rotation → 400, overlap warnings, duplicate codes 400 (E2E + UT) | — | — | — |
| FR-096 | P0 | VERIFIED | rowVersion 409 keeps local edits + "Load latest" prompt; opt-in 30 s autosave | — | — | — |
| FR-097 | P0 | VERIFIED | CSV export (formula-safe) / import into Unplaced tray; publish blocked until placed (E2E) | — | — | — |
| FR-098 | P0 | VERIFIED | clone + Align (scale/offset) + remap report by code; approved remap publish (E2E AT-081) | — | — | — |
| FR-104 | P0 | VERIFIED | zoom/pan buttons, drag pan, keyboard +/-, filters, request CTA (BR) | — | — | — |
| FR-105 | P0 | VERIFIED | AVAILABLE hatched + label; RESERVED no name; OCCUPIED approved name; BLOCKED neutral "Unavailable" | RESERVED-name setting toggle | — | P2 |
| FR-106 | P0 | VERIFIED | detail panel + "Request this area" → account (no promise) | prefill in account → Slice B | — | — |
| FR-107 | P0 | VERIFIED | `s-maxage=60`, no PII/internal notes (E2E asserts) | — | — | — |
| FR-108 | P0 | VERIFIED | UAT returns COMING_SOON / units [] | — | — | — |
| FR-109 | P0 | VERIFIED | each unit focusable button with name "A1, 15 by 24 metres, 360 square metres, occupied by …"; list table; keyboard zoom; reduced motion (BR) | screen-reader manual check | — | — |
| FR-110 | P0 | NOT | — | boothNo from active assignment for directory | FR-014 | P1 |
| FR-111 | P0 | VERIFIED | stats per status/category, m² and %, CSV (Viewer read-only) (E2E) | — | — | — |
| FR-112 | P0 | VERIFIED | audit diffs: units added/changed/removed, categories, align, CSV, publish+remap, area override | — | — | — |
| FR-113 | P2 | NOT (out of scope) | — | P2 approval | — | P2 |
| FR-144 | P0 | VERIFIED | see FR-090–098 | — | — | — |

## F. Invoice & manual payment (FR-045–051, 056, 057, 065, 123–132, 151)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-045 | P0 | PARTIAL | customer invoices + PDF | bank instructions only after issue (verify) | D-01 | P0 |
| FR-046 | P0 | VERIFIED | E2E draft/issue unique number (InvoiceSequence) | tax config | D-01 | — |
| FR-047 | P0 | VERIFIED | E2E finance-controls: email share → InvoiceDelivery (masked), WhatsApp compose needs verified phone | WhatsApp compose positive path needs SMS-verified account (D-04) | — | — |
| FR-048 | P0 | VERIFIED | E2E Finance-only, dup reference flagged (AT-068) | evidence attachment → FR-128 | — | — |
| FR-049 | P0 | VERIFIED | E2E DP → PARTIALLY_PAID, full → PAID, overpay blocked | reversals → FR-131 | — | — |
| FR-050 | P0 | PARTIAL | PDF download; PAYMENT_VERIFIED email | receipt document after verification | — | P1 |
| FR-051 | P0 | VERIFIED | E2E portal reflects server state | — | — | — |
| FR-056 | P0 | VERIFIED | E2E: cancel after DP → REFUND_PENDING; REFUND adjustment with payout reference → REFUNDED | refund eligibility policy | D-03 | — |
| FR-057 | P0 | VERIFIED | `ENABLE_INVOICES` + bank env gate; no PSP | — | — | — |
| FR-123 | P0 | VERIFIED | manual payment request persisted + CMS notification + outbox, idempotent (E2E AT-062) | — | — | — |
| FR-124 | P0 | VERIFIED | E2E notifications list + bulk read role-scoped | overdue alerts | — | — |
| FR-125 | P0 | PARTIAL | items, DP, dueAt, PDF | tax lines, invoice revision chain | D-01 | P1 |
| FR-126 | P0 | VERIFIED | `send` route + InvoiceDelivery + worker SENT/FAILED; ledger API deliveries | Business API (P2) | — | — |
| FR-127 | P0 | UNVERIFIED | bankDetails() gated | E2E: hidden before issue | D-01 | P0 |
| FR-128 | P0 | VERIFIED | `POST /api/customer/invoices/[id]/payment-proof` (magic-byte check, 5MB, AES-GCM private storage); E2E: proof keeps AWAITING_PAYMENT, Finance verifies via proofTransferId; Sales 403 on proof file | size/retention policy | D-10 | — |
| FR-129 | P0 | VERIFIED | E2E 0..N receipts incl. proof-linked receipts; `recomputeInvoice` in tx | — | — | — |
| FR-130 | P0 | VERIFIED | `customerPaymentState` (UT) + E2E states AWAITING/DP/PAID/REFUND_PENDING/REFUNDED; overdue flag | — | — | — |
| FR-131 | P0 | VERIFIED | `POST /api/admin/invoices/[id]/adjustments` REVERSAL/REFUND append-only; E2E AT-087 (original receipts kept, balance recomputed) | — | D-03 | — |
| FR-132 | P0 | VERIFIED | `FINANCE_APPROVAL_THRESHOLD_MINOR` (off by default); E2E: 202 pending, maker 403, Sales 403, second Finance approves | threshold value | D-11 | — |
| FR-151 | P0 | VERIFIED | grep: no Midtrans/Snap/webhook code | — | — | — |
| AT-069 | — | VERIFIED | E2E finance-controls | — | — | — |

## G. QR pass & admission (FR-058, 074–089, 134–137)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-058 | P0 | VERIFIED | E2E pass issued; scan only via admin API | — | — | — |
| FR-074 | P0 | VERIFIED | random token, hash lookup, AES-GCM sealed (code + E2E) | — | — | — |
| FR-075 | P0 | VERIFIED | E2E admission: reissue → old code REVOKED, new pass active; validity/entitlement/revocation fields | — | — | — |
| FR-076 | P0 | VERIFIED | passes API: QR + short code XXXXX-XXXXX (HMAC, hashed); account Download QR + print CSS; E2E scan by short code | browser print visual check | — | — |
| FR-077 | P0 | VERIFIED | invoice cancel revokes registration passes; reversal of full payment suspends conference access + revokes passes (E2E) | booth allocations flagged to Operations for explicit release | — | — |
| FR-078 | P1 | NOT | — | attendance history | — | P1 |
| FR-079 | P1 | NOT | — | secure email link | — | P1 |
| FR-080 | P0 | VERIFIED | `/admin/check-in/scanner` alias; E2E anon scan 401 | real device camera test (UAT) | — | — |
| FR-081 | P0 | VERIFIED | Gate + StaffGateAssignment; scan enforces gate/zone/assignment; E2E AT-076 (403, no admission, audited) | — | — | — |
| FR-082 | P0 | VERIFIED | E2E NOT_YET_VALID/INVALID/ALREADY | — | — | — |
| FR-083 | P0 | VERIFIED | PassScan per attempt; E2E concurrent → 1 admission | device meta | — | — |
| FR-084 | P0 | UNVERIFIED | check-in page result panel | visual test | — | P1 |
| FR-085 | P0 | VERIFIED | AdmissionPolicy per zone, default ONCE_PER_DAY; E2E re-entry counted as entry not unique | default sign-off | D-09 | — |
| FR-086 | P0 | VERIFIED | manual code same API; 15 invalid/10 min per staff → 429 (E2E) | — | — | — |
| FR-087 | P0 | VERIFIED | attendance API: accounts, registrations by type, valid holders, unique arrived, entries, rejected by reason, day/gate/zone filters (E2E) | — | — | — |
| FR-088 | P0 | UNVERIFIED | scanner offline label (PR #8) | browser test | — | P1 |
| FR-089 | P0 | PARTIAL | E2E: forged token INVALID, revoked, unauthorized gate/staff, brute force 429, concurrent dual gate | screenshot reuse = same token (dedup by admission) documented; device tests | — | P1 |
| FR-134 | P0 | VERIFIED | see FR-080/081 | — | — | — |
| FR-135 | P0 | VERIFIED | name/accountId match in scan route | — | — | — |
| FR-136 | P0 | VERIFIED | atomic admission + lineage dedupe across reissue + reentry policy (E2E) | — | — | — |
| FR-137 | P0 | VERIFIED | `/api/admin/passes/[id]/revoke/reissue` + `/admin/check-in/settings` UI; E2E; customer notified via outbox | — | — | — |

## H. CMS administration & RBAC (FR-031, 033, 040, 052, 120, 147, 148, 153)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-033 | P0 | VERIFIED | E2E anon 401, scrypt, HttpOnly session | — | — | — |
| FR-040 | P0 | PARTIAL | AuditLog on many actions (E2E) | check-in override, reissue | — | P0 |
| FR-052 | P0 | VERIFIED | E2E lists per role | — | — | — |
| FR-120 | P0 | PARTIAL | registrations/booths/payments lists + search (E2E) | customers list/detail drill-down | — | P0 |
| FR-147 | P0 | PARTIAL | per-endpoint role guards (E2E RBAC) | settings/staff pages; field-level scope | — | P0 |
| FR-148 | P0 | PARTIAL | audit before/after on key actions | internal notes; customer timeline | — | P0 |
| FR-153 | P0 | NOT | — | admin corrections with reason + snapshot | — | P0 |

## I. Reports, notifications & ops (FR-028, 031, 121, 122, 146, 149)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-028 | P0 | VERIFIED | outbox + worker isolation (UT), save independent of email | — | — | — |
| FR-031 | P0 | PARTIAL | XLSX/PDF export, safeCell, RBAC (E2E) | date basis filters | — | P0 |
| FR-121 | P0 | PARTIAL | from/to/type/status/q | date basis (created/confirmed/paid/checked-in), export job tracking | — | P0 |
| FR-122 | P0 | PARTIAL | role guard + safeCell | signed expiring links, column minimization | — | P0 |
| FR-146 | P0 | PARTIAL | outbox topics | booking confirmed/cancelled, pass revoked emails | — | P0 |
| FR-149 | P0 | PARTIAL | dashboard KPIs | period presets + unique counts | — | P0 |

| AT-058 | — | VERIFIED | E2E one account visitor + conference (+ booth in business-flow) | — | — | — |
| AT-059 | — | VERIFIED | E2E single-use hashed OTP | — | — | — |
| AT-061 | — | VERIFIED | E2E brute force, reuse, rate limit, no enumeration | — | — | — |
| AT-062 | — | VERIFIED | E2E auth-account | — | — | — |
| AT-066 | — | VERIFIED | E2E auth-account | — | — | — |
| AT-086 | — | VERIFIED | E2E auth-account | — | — | — |
| AT-063 | — | VERIFIED | E2E finance-controls (delivery history) | — | — | — |
| AT-064 | — | VERIFIED | E2E finance-controls | — | — | — |
| AT-087 | — | VERIFIED | E2E finance-controls | — | — | — |
| AT-075 | — | VERIFIED | E2E cms-regression concurrent scanners → 1 admission | — | — | — |
| AT-076 | — | VERIFIED | E2E admission | — | — | — |
| AT-081 | — | VERIFIED | E2E floorplan-editor remap | — | — | — |
| AT-082 | — | VERIFIED | E2E + BR (draft save, preview report, publish, clone rollback) | — | — | — |
| AT-091 | — | VERIFIED | BR 360px no horizontal scroll, zoom, list | real-device check | — | — |
| AT-092 | — | VERIFIED | COMING_SOON + "no booth available" notice | — | — | — |
| AT-077 | — | PARTIAL | E2E revoked/expired logic; unpaid conference pass → slice C | — | — | — |

## P1/P2 out of MVP (tracked, not started): FR-032, FR-041, FR-059, FR-154, FR-156, FR-157, FR-158, FR-159.

## Blocked by owner decisions (fail-closed defaults in code)
D-01 bank/tax (FR-046/125/127), D-02 prices/DP (FR-042/044), D-03 refund (FR-056/131 payout), D-04 SMS provider (FR-068/AT-060), D-05 WhatsApp API (FR-158), D-09 reentry default (FR-085), D-10 proof policy (FR-128 size/retention), D-11 maker-checker threshold (FR-132), D-12 legal/content (FR-012/005/009), D-13 retention (FR-150), D-14 hosting.

## Changelog
- 2026-11-08 initial matrix from code + E2E (PR #9, #10).
- Slice F (finance controls): FR-047/056/126/128/130/131/132, AT-063/064/069/087 → VERIFIED. Migration `20261109010000_finance_controls` (additive).
- Slice G (admission): FR-075/076/080/081/085/086/087/134/136/137, AT-075/076 → VERIFIED. Migration `20261109020000_admission_controls`. **Operational note:** after deploy, Operations must create gates and assign CHECKIN_STAFF before scanning.
- Slice E (floorplan): FR-015/092/094–098/101/103–107/109/111/112/144, AT-081/082/091/092 → VERIFIED; FR-091/093 PARTIAL. Migration `20261109030000_floorplan_editor`. Nginx routes `/floorplan` to the app.
- Slice B/C (account & conference): FR-023/066/072/073/077/116/118/123/143, AT-057/058/059/061/062/066/086 → VERIFIED. Migration `20261109040000_account_security`. New env: `OTP_IP_LIMIT_PER_HOUR` (60), `OTP_DESTINATION_LIMIT_PER_HOUR` (5), `CONFERENCE_ACCESS_ON_DP` (false).
