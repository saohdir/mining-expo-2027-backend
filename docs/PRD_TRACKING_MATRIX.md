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

Snapshot after slices F, G, E, B/C, H/I/A and frontend PR #1 (151 FR rows listed; P1/P2 items not listed are out of MVP):

| Priority | VERIFIED | UNVERIFIED | PARTIAL | NOT |
| --- | --- | --- | --- | --- |
| P0 (140 rows) | 128 | 2 | 10 | 0 |
| P1/P2 (11 rows) | 9 | 0 | 1 | 1 |

Many PARTIAL P0 rows are blocked only by owner content/legal decisions (D-01/D-02/D-04/D-12) or need device/UAT evidence.

## A. Public website & content (FR-001–018, FR-024/027/030, FR-034–039)

Frontend is static HTML (`mining-expo-2027-demo`), English only, no CMS binding.

| FR | P | Status | Evidence | Gap / missing acceptance | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-001 | P0 | PARTIAL | responsive nav, breadcrumb, **EN/ID language switch** (remembered; html lang; CMS serves ID layouts with EN fallback) (BR) | Indonesian copy of designed sections to be authored in Pages & layout (D-12) | D-12 | P0 (content) |
| FR-002 | P0 | VERIFIED | hero CTAs → /floorplan (exhibitor) and /account (visitor/conference); BR (frontend PR #1) | — | — | — |
| FR-003 | P0 | VERIFIED | `assets/platform.js` WIB countdown with ongoing/ended states; BR | — | — | — |
| FR-004 | P0 | UNVERIFIED | exhibition/index.html | verify 8 categories vs source PDF | D-12 | P1 |
| FR-005 | P0 | PARTIAL | CMS partners/organizers with role + rights gate rendered on /partners when published (E2E + BR) | logos/approvals content | D-12 | P0 (content) |
| FR-006 | P0 | VERIFIED | `/conferences` + `/conferences/[slug]` (published only; date/fee/seats shown as "to be announced" until approved; description from CMS; JSON-LD; register link preselects programme) (E2E) | approved programme copy (D-12) | — | — |
| FR-007 | P0 | VERIFIED | exhibitor page → published floorplan + account request; no unapproved prices | — | — | — |
| FR-008 | P0 | UNVERIFIED | the-venue/index.html | Maps link check | — | P1 |
| FR-009 | P0 | PARTIAL | CMS downloads (label, type, size, updated) rendered on /exhibitors (E2E + BR) | approved files | D-12 | P0 (content) |
| FR-010 | P0 | VERIFIED | contact form → lead inbox + notification (BR + E2E) | contact details content | — | — |
| FR-011 | P0 | PARTIAL | titles/descriptions per page **and per locale** via Pages & layout SEO, canonical, OpenGraph, JSON-LD (event + conferences), sitemap/robots | separate /id URLs + hreflang need approved ID copy; canonical domain at go-live (D-14) | D-12 | P0 (content) |
| FR-012 | P0 | PARTIAL | consent checkboxes required; /privacy/ & /terms/ linked in every footer (noindex DRAFT) | final legal text | D-12 | BLOCKED |
| FR-013 | P1 | VERIFIED | NEWS content (draft/published, date) rendered with pagination on /news (BR) | — | — | — |
| FR-014 | P1 | VERIFIED | `/api/public/exhibitors` approved names only, search + category, friendly empty state (E2E + BR) | — | — | — |
| FR-015 | P0 | VERIFIED | `/floorplan` public viewer (search, legend, list fallback, request CTA) — BR 360px; E2E public API | — | — | — |
| FR-016 | P1 | VERIFIED | GALLERY content with rights/alt gate rendered on /highlights (BR) | approved photos (D-12) | — | — |
| FR-017 | P1 | PARTIAL | partner/sponsor lead CTA preselects enquiry topic (BR) | package contents/prices (D-02) | — | — |
| FR-018 | P1 | VERIFIED | confirmed schedule only (conferences with startsAt), day filter (BR) | — | — | — |
| FR-024 | P0 | VERIFIED | leadType CONTACT/PARTNER/SPONSOR/EXHIBITOR (E2E) | — | — | — |
| FR-027 | P0 | VERIFIED | honeypot + per-IP limits on OTP and leads → 429; duplicate submissions deduped (E2E) | optional CAPTCHA | — | — |
| FR-030 | P1 | VERIFIED | UTM source/medium/campaign stored on leads (E2E) | — | — | — |
| FR-034 | P0 | VERIFIED | event settings + content blocks + **Pages & layout builder** for every public page (order/hide sections, add blocks, SEO, draft/preview/publish/rollback) (E2E + BR) | — | — | — |
| FR-035 | P0 | VERIFIED | conferences + partners/scopes/downloads CRUD with draft/published (E2E) | — | — | — |
| FR-036 | P0 | VERIFIED | `/admin/leads` NEW/CONTACTED/QUALIFIED/CLOSED transitions + audit (E2E) | — | — | — |
| FR-037 | P0 | VERIFIED | `/api/admin/assets` image upload: magic/MIME check, WebP re-encode, alt + rights required, audited (E2E) | — | — | — |
| FR-038 | P0 | VERIFIED | drafts only via authenticated CMS API (preview); public API published only (E2E) | — | — | — |
| FR-039 | P1 | VERIFIED | news, exhibitor directory, gallery via content CMS | — | — | — |

## B. Accounts, identity & customer (FR-019/020/025/026/043/068–070/114–119/150/152, AT-057–061/086/089)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-019 | P0 | VERIFIED | E2E business-flow (customer sees own requests/invoices/assignment) | — | — | — |
| FR-020 | P0 | VERIFIED | `/api/health` MANUAL_TRANSFER_ONLY; E2E invoice/verify; no PSP code | — | — | — |
| FR-025 | P0 | VERIFIED | Zod `.strict()` everywhere; per-field issues rendered (contact form BR, OTP/booth E2E) | — | — | — |
| FR-026 | P0 | VERIFIED | consent literal(true) on booth/registration; E2E | — | — | — |
| FR-043 | P0 | VERIFIED | E2E anon booth request 401; all customer routes `customer()` | — | — | — |
| FR-068 | P0 | VERIFIED | **Amended by CR-AUTH-01**: email OTP verifies registration; sign-in with email + password; forgot/reset + legacy set-up (E2E + BR customer-password-auth) | SMS not used (D-04) | CR-AUTH-01 | — |
| FR-069 | P0 | VERIFIED | `/api/customer/me` owner-only; E2E foreign PDF/accept 403/404 | — | — | — |
| FR-070 | P0 | VERIFIED | profile name/company/job/country + verified email/phone; snapshots per booking unchanged by edits (E2E) | — | — | — |
| FR-114 | P0 | VERIFIED | E2E: one account → visitor + conference + booth | — | — | — |
| FR-115 | P0 | VERIFIED | **Amended by CR-AUTH-01**: OTP for registration only (hashed, single use, 5 min, 5 attempts, throttled, CMS switch); OTP sign-in endpoints return 410 | — | CR-AUTH-01 | — |
| FR-116 | P0 | VERIFIED | contact change: recent auth ≤15 min, OTP to NEW target, other sessions revoked, old email alerted (E2E AT-086) | trusted recovery when channel lost (manual via organizer) | D-04 | — |
| FR-117 | P0 | VERIFIED | account hub three journeys after OTP sign-in (BR) | — | — | — |
| FR-118 | P0 | VERIFIED | profile edits audited before/after; enrollment snapshots; customer timeline API (E2E) | — | — | — |
| FR-119 | P0 | VERIFIED | tabs + "Action needed" banners from server state (BR) | — | — | — |
| FR-150 | P0 | PARTIAL | consent version/time, export minimisation, access logs, data-request intake + resolution (E2E) | retention/purge schedule (D-13) | — | — |
| FR-152 | P0 | VERIFIED | notification preference EMAIL/WHATSAPP (WhatsApp requires verified phone) (E2E) | automated WhatsApp sending is P2 FR-158 | — | — |
| AT-057 | — | VERIFIED | E2E safe return path + account intent restore (selected booth preselected after OTP) | — | — | — |

## C. Visitor & conference registration (FR-022/023/029/042/054/071–073/133/155)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-022 | P0 | VERIFIED | E2E cms-regression visitor → CONFIRMED + pass | — | — | — |
| FR-023 | P0 | VERIFIED | E2E auth-account: paid conference stays SUBMITTED on DP, CONFIRMED + passes on full payment, suspended on reversal (`CONFERENCE_ACCESS_ON_DP` opt-in) | — | D-02 | — |
| FR-029 | P0 | VERIFIED | registration/booth/lead return reference ids; status ≠ paid (BR + E2E) | — | — | — |
| FR-042 | P0 | VERIFIED | admissionMode FREE / MANUAL_INVOICE / TBA in public events; booths QUOTE_REQUIRED by workflow; no checkout (E2E) | prices (D-02) | — | — |
| FR-054 | P0 | VERIFIED | visitor free: no invoice/transfer created (E2E) | — | — | — |
| FR-071 | P0 | VERIFIED | duplicate per user/program 409 (E2E), serializable capacity | — | — | — |
| FR-072 | P0 | VERIFIED | confirmed conference → CONFERENCE pass + EXPO_ENTRY if none (E2E) | per-session zones (FR-157, P1) | — | — |
| FR-073 | P0 | VERIFIED | no conference pass until full payment by default; DP does not grant (E2E) | — | D-08/D-09 | — |
| FR-133 | P0 | VERIFIED | published programme change alerts each active booking via outbox; snapshots retained (E2E) | — | — | — |
| FR-155 | P1 | VERIFIED | waitlist only when FULL, idempotent, manual release re-checks capacity (E2E) | — | — | — |

## D. Exhibitor booking & booth (FR-021/044/053/055/060–067/099–103/138–145)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-021 | P0 | VERIFIED | E2E booth request; stale plan 409 | — | — | — |
| FR-044 | P0 | VERIFIED | booth request review summary (units, area, no price until quotation, terms link); invoice shows DP/due | — | — | — |
| FR-053 | P0 | VERIFIED | E2E quote/accept/assign separated | — | — | — |
| FR-055 | P0 | VERIFIED | partial unique index + E2E double-assign 409, concurrent scans | — | — | — |
| FR-060 | P0 | VERIFIED | `/account/booth?unit=…` dedicated route keeps selection (E2E) | localized route with D-12 | — | — |
| FR-061 | P0 | VERIFIED | E2E (units, area, consent, notes) | zone preference field | — | P1 |
| FR-062 | P0 | VERIFIED | free-text m² (validateArea); FAQ no longer lists fixed presets | — | — | — |
| FR-063 | P0 | VERIFIED | E2E request stored + outbox BOOTH_REQUEST_RECEIVED | — | — | — |
| FR-064 | P0 | VERIFIED | E2E status/offer/hold/assign independent + audit | — | — | — |
| FR-065 | P0 | VERIFIED | E2E invoice must equal accepted quote | revision/void flow → FR-131 | — | — |
| FR-066 | P0 | VERIFIED | identical booth retry within 10 min returns same request (E2E); duplicate units 400; registrations dedupe | email acknowledgement includes reference (outbox) | — | — |
| FR-067 | P0 | VERIFIED | booths dataset: period (created/assigned), hall, zone, requested/offered/assigned m², payment columns (role-scoped) | — | — | — |
| FR-099 | P0 | VERIFIED | E2E assign requires reason; payment cannot assign | — | — | — |
| FR-100 | P0 | VERIFIED | DB partial unique index (migration #3) + E2E | — | — | — |
| FR-101 | P0 | VERIFIED | assign → 409 AREA_MISMATCH unless override reason; audited (E2E) | — | — | — |
| FR-102 | P0 | VERIFIED | E2E holds 1–168h, release, worker expiry (UT) | — | — | — |
| FR-103 | P0 | VERIFIED | public name only when active assignment approvedForPublic (public API) | logo rights (NFR-12) | D-12 | — |
| FR-138 | P0 | VERIFIED | account selector filters hall/zone/available/code + public viewer (BR) | — | — | — |
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
| FR-091 | P0 | VERIFIED | PNG/JPG/WebP + SVG (unsafe content rejected, rasterised server-side), PDF rejected with convert message, alt/rights gate (E2E + UT) | — | — | — |
| FR-092 | P0 | VERIFIED | BoothCategory CRUD (HEX, pattern, order), seeded purple/pink/blue; SVG pattern fills; E2E RBAC | WCAG contrast audit of custom colours | — | — |
| FR-093 | P0 | VERIFIED | draw/drag/resize handle (mouse + keyboard)/rotate/duplicate/snap/undo-redo (BR) | — | — | — |
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
| FR-110 | P0 | VERIFIED | directory boothNo derived from active approved assignments only (E2E) | — | — | — |
| FR-111 | P0 | VERIFIED | stats per status/category, m² and %, CSV (Viewer read-only) (E2E) | — | — | — |
| FR-112 | P0 | VERIFIED | audit diffs: units added/changed/removed, categories, align, CSV, publish+remap, area override | — | — | — |
| FR-113 | P2 | NOT (out of scope) | — | P2 approval | — | P2 |
| FR-144 | P0 | VERIFIED | see FR-090–098 | — | — | — |

## F. Invoice & manual payment (FR-045–051, 056, 057, 065, 123–132, 151)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-045 | P0 | VERIFIED | same-origin invoice detail + PDF; bank instructions only for issued invoices (E2E) | — | — | — |
| FR-046 | P0 | VERIFIED | E2E draft/issue unique number (InvoiceSequence) | tax config | D-01 | — |
| FR-047 | P0 | VERIFIED | E2E finance-controls: email share → InvoiceDelivery (masked), WhatsApp compose needs verified phone | WhatsApp compose positive path needs SMS-verified account (D-04) | — | — |
| FR-048 | P0 | VERIFIED | E2E Finance-only, dup reference flagged (AT-068) | evidence attachment → FR-128 | — | — |
| FR-049 | P0 | VERIFIED | E2E DP → PARTIALLY_PAID, full → PAID, overpay blocked | reversals → FR-131 | — | — |
| FR-050 | P0 | VERIFIED | receipt PDF only after Finance verification (409 before) (E2E) | approved template wording (D-01) | — | — |
| FR-051 | P0 | VERIFIED | E2E portal reflects server state | — | — | — |
| FR-056 | P0 | VERIFIED | E2E: cancel after DP → REFUND_PENDING; REFUND adjustment with payout reference → REFUNDED | refund eligibility policy | D-03 | — |
| FR-057 | P0 | VERIFIED | `ENABLE_INVOICES` + bank env gate; no PSP | — | — | — |
| FR-123 | P0 | VERIFIED | manual payment request persisted + CMS notification + outbox, idempotent (E2E AT-062) | — | — | — |
| FR-124 | P0 | VERIFIED | E2E notifications list + bulk read role-scoped | overdue alerts | — | — |
| FR-125 | P0 | PARTIAL | line items, DP, due date, numbering, PDF, revision chain (VOID + linked draft) (E2E) | tax lines need D-01 | — | — |
| FR-126 | P0 | VERIFIED | `send` route + InvoiceDelivery + worker SENT/FAILED; ledger API deliveries | Business API (P2) | — | — |
| FR-127 | P0 | VERIFIED | bank details only on issued/payable invoices; drafts hidden; none after cancellation (E2E finance-controls) | approved bank data | D-01 | — |
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
| FR-078 | P1 | VERIFIED | `/api/customer/attendance` own history in WIB, no staff/gate data (E2E) | — | — | — |
| FR-079 | P1 | VERIFIED | PASS_READY email links to sign-in, never contains the QR token (E2E outbox) | — | — | — |
| FR-080 | P0 | VERIFIED | `/admin/check-in/scanner` alias; E2E anon scan 401 | real device camera test (UAT) | — | — |
| FR-081 | P0 | VERIFIED | Gate + StaffGateAssignment; scan enforces gate/zone/assignment; E2E AT-076 (403, no admission, audited) | — | — | — |
| FR-082 | P0 | VERIFIED | E2E NOT_YET_VALID/INVALID/ALREADY | — | — | — |
| FR-083 | P0 | VERIFIED | PassScan per attempt; E2E concurrent → 1 admission | device meta | — | — |
| FR-084 | P0 | VERIFIED | scanner shows server decision text; accepted shows name/organization only (BR) | real-device check | — | — |
| FR-085 | P0 | VERIFIED | AdmissionPolicy per zone, default ONCE_PER_DAY; E2E re-entry counted as entry not unique | default sign-off | D-09 | — |
| FR-086 | P0 | VERIFIED | manual code same API; 15 invalid/10 min per staff → 429 (E2E) | — | — | — |
| FR-087 | P0 | VERIFIED | attendance API: accounts, registrations by type, valid holders, unique arrived, entries, rejected by reason, day/gate/zone filters (E2E) | — | — | — |
| FR-088 | P0 | VERIFIED | offline → "Connection unavailable — no entry decision", no admission (BR AT-088) | — | — | — |
| FR-089 | P0 | PARTIAL | E2E: forged token INVALID, revoked, unauthorized gate/staff, brute force 429, concurrent dual gate | screenshot reuse = same token (dedup by admission) documented; device tests | — | P1 |
| FR-134 | P0 | VERIFIED | see FR-080/081 | — | — | — |
| FR-135 | P0 | VERIFIED | name/accountId match in scan route | — | — | — |
| FR-136 | P0 | VERIFIED | atomic admission + lineage dedupe across reissue + reentry policy (E2E) | — | — | — |
| FR-137 | P0 | VERIFIED | `/api/admin/passes/[id]/revoke/reissue` + `/admin/check-in/settings` UI; E2E; customer notified via outbox | — | — | — |

## H. CMS administration & RBAC (FR-031, 033, 040, 052, 120, 147, 148, 153)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-033 | P0 | VERIFIED | E2E anon 401, scrypt, HttpOnly session | — | — | — |
| FR-040 | P0 | VERIFIED | every privileged write audited (status, invoice, ledger, floorplan publish/remap, pass revoke/reissue, gate denials, settings, staff); no admission-override path exists (fail-closed by design) | — | — | — |
| FR-052 | P0 | VERIFIED | E2E lists per role | — | — | — |
| FR-120 | P0 | VERIFIED | `/admin/customers` search + drill-down (registrations, booths, invoices) role-scoped (E2E) | — | — | — |
| FR-147 | P0 | VERIFIED | per-endpoint RBAC (all E2E suites); `/admin/staff` role/deactivate/reset with session revocation, last-Super-Admin guard; `/admin/settings` status (E2E) | field-level scope beyond role columns | — | — |
| FR-148 | P0 | VERIFIED | InternalNote (staff-only, audited, never in customer APIs — E2E) + before/after audit on transitions | — | — | — |
| FR-153 | P0 | VERIFIED | customer correction with reason (snapshots untouched), SA-only email correction forcing re-verification, duplicate registration cancel + pass revoke (E2E) | — | — | — |

## I. Reports, notifications & ops (FR-028, 031, 121, 122, 146, 149)

| FR | P | Status | Evidence | Gap | Dep | Prio |
| --- | --- | --- | --- | --- | --- | --- |
| FR-028 | P0 | VERIFIED | outbox + worker isolation (UT), save independent of email | — | — | — |
| FR-031 | P0 | VERIFIED | XLSX/PDF exports: inclusive WIB dates, type/status filters, ExportJob + audit, formula-safe (E2E AT-070/071) | async jobs for >2,000 rows (NFR-26) | — | — |
| FR-121 | P0 | VERIFIED | date basis created/confirmed/checkedIn, assigned, issued/paid; WIB inclusive; type/status/hall/zone filters; ExportJob (E2E) | amount filter | — | — |
| FR-122 | P0 | VERIFIED | role-scoped columns; background jobs ≤100k rows, encrypted private file, requester-only download, 24 h expiry, audited (E2E) | — | — | — |
| FR-146 | P0 | VERIFIED | outbox emails: OTP, request received, quote, invoice, payment verified/corrected, refund, booking cancelled, pass ready/revoked/reissued, programme change, contact change; retry/backoff (E2E outbox rows + worker) | delivery to real provider (UAT) | — | — |
| FR-149 | P0 | VERIFIED | `/api/admin/reports/kpi` presets today/7d/30d/month/custom/all, basis per KPI, unique people (E2E) | — | — | — |

| AT-070 | — | VERIFIED | E2E cms-admin (inclusive WIB day, exact rows) | — | — | — |
| AT-071 | — | VERIFIED | E2E cms-admin (XLSX cell escaped) | — | — | — |
| AT-072 | — | VERIFIED | E2E cms-admin (Viewer/Sales finance export 403) | — | — | — |
| AT-058 | — | VERIFIED | E2E one account visitor + conference (+ booth in business-flow) | — | — | — |
| AT-059 | — | VERIFIED (amended CR-AUTH-01) | registration OTP single-use, never creates a session | — | — | — |
| AT-060 | — | SUPERSEDED by CR-AUTH-01 | SMS OTP login removed | — | — | — |
| AT-CR1-01..12 | — | VERIFIED | `customer-password-auth.e2e.mjs` + browser: register/OTP/resend/expiry, password set/mismatch/weak, duplicate, login generic/throttle/CSRF/expiry/logout, forgot/reset invalid/expired/reused, legacy set-up, login with registration closed | — | — | — |
| AT-061 | — | VERIFIED | E2E brute force, reuse, rate limit, no enumeration | — | — | — |
| AT-062 | — | VERIFIED | E2E auth-account | — | — | — |
| AT-066 | — | VERIFIED | E2E auth-account | — | — | — |
| AT-088 | — | VERIFIED | BR ui-regression (offline fail-closed) | — | — | — |
| AT-084 | — | VERIFIED | BR/E2E server-derived dashboard state | — | — | — |
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

## P1/P2 not started — need owner approval/policy: FR-032 (CRM), FR-041 (multi-event), FR-059 (group billing/discounts), FR-154 (bulk import/badges), FR-156 (exhibitor staff passes), FR-157 (per-session attendance needs gate policy), FR-158 (SMS/WA API), FR-159 (fee estimator).

## Blocked by owner decisions (fail-closed defaults in code)
D-01 bank/tax (FR-046/125/127), D-02 prices/DP (FR-042/044), D-03 refund (FR-056/131 payout), D-04 SMS provider (FR-068/AT-060), D-05 WhatsApp API (FR-158), D-09 reentry default (FR-085), D-10 proof policy (FR-128 size/retention), D-11 maker-checker threshold (FR-132), D-12 legal/content (FR-012/005/009), D-13 retention (FR-150), D-14 hosting.

## Changelog
- 2026-11-08 initial matrix from code + E2E (PR #9, #10).
- Slice F (finance controls): FR-047/056/126/128/130/131/132, AT-063/064/069/087 → VERIFIED. Migration `20261109010000_finance_controls` (additive).
- Slice G (admission): FR-075/076/080/081/085/086/087/134/136/137, AT-075/076 → VERIFIED. Migration `20261109020000_admission_controls`. **Operational note:** after deploy, Operations must create gates and assign CHECKIN_STAFF before scanning.
- Slice E (floorplan): FR-015/092/094–098/101/103–107/109/111/112/144, AT-081/082/091/092 → VERIFIED; FR-091/093 PARTIAL. Migration `20261109030000_floorplan_editor`. Nginx routes `/floorplan` to the app.
- Slice B/C (account & conference): FR-023/066/072/073/077/116/118/123/143, AT-057/058/059/061/062/066/086 → VERIFIED. Migration `20261109040000_account_security`. New env: `OTP_IP_LIMIT_PER_HOUR` (60), `OTP_DESTINATION_LIMIT_PER_HOUR` (5), `CONFERENCE_ACCESS_ON_DP` (false).
- Slice H/I/A (CMS admin, reports, leads, content): FR-024/027/030/031/035/036/038/067/120/121/147/148/153, AT-070/071/072 → VERIFIED; FR-005/009/010/034/122 PARTIAL. Migration `20261109050000_cms_admin`.
- Frontend PR saohdir/mining-expo-2027-demo#1: FR-002/003/007/010/062 → VERIFIED; FR-005/009/012 PARTIAL (content/legal).
- Technical completion: FR-013/014/016/018/025/029/039/078/079/084/088/091/093/110/117/119/122/149/152/155, AT-084/088 → VERIFIED. Migration `20261109060000_engagement`. Worker now also runs background exports (compose: worker mounts `private_data`).
- Governance batch: FR-034/037/042/044/045/050/060/070/115/133/138/146 → VERIFIED; FR-001/006/011/125/150 PARTIAL (owner content/policy). Migration `20261109070000_governance`.
- CR-AUTH-01 (approved change request): customer sign-in moved from passwordless OTP to email + password; OTP only for registration. See `docs/CR-AUTH-01_CUSTOMER_PASSWORD_AUTH.md`. Migration `20261110010000_customer_password_auth`.
- CMS Pages & layout builder (FR-034/038, NFR-04 SEO per page): `docs/CMS_PAGE_BUILDER.md`. Migration `20261110020000_page_builder`.
- Public conference pages (FR-006) and EN/ID language switch (FR-001/NFR-09 infrastructure).
